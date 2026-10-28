import { APIError } from "encore.dev/api";
import { isRealYmd } from "../../../lib/businessDate";
import type { Actor } from "../../../lib/rbac";
import type {
  TariffFile,
  RailDirection,
  RailLayout,
  RailOffer,
  RailOfferContainer,
  RailOfferMatch,
  RailOperatorItem,
  RailPricedContainer,
  RailRate,
  RailRateRow,
  RailTariffItem,
  SupplierTariffVersionDetail,
  TariffPortCode,
  TariffRef,
} from "../interfaces/interfaces";
import { bandCode, convertRail } from "../lib/railConvert";
import { layoutProblem, parseRailLayout } from "../lib/railLayout";
import { placeQuery, pricedContainers, rowOffer, type BandRefusal } from "../lib/railOffers";
import { TARIFF_PORT_CODES, chosenPortsAndDirections, portsAndDirectionsOf } from "../lib/tariffPorts";
import { sheetPreview, type Sheet } from "../lib/sheet";
import { tariffRepository, type RateFilter } from "../repositories/tariff.repository";
import type { RailRateRecord } from "../schemas/tariff.schema";
import { readRailLayout } from "./railLayoutReader.service";
import {
  approveVersion,
  businessToday,
  discardVersion,
  draftSheets,
  readFields,
  replaceDraft,
  saveDraft,
  sheetsOf,
  sourceFile,
  supplierGlance,
  supplierTariffs,
  suppliersOf,
  summaryOf,
  tariffName,
  unusableLayout,
  updateTariff,
  uploadTarget,
  uploadedFile,
  versionOfMode,
  type ReadFields,
  type SupplierTariffs,
} from "./tariffFiles";

// Rail operators' tariffs: a manager uploads the operator's own Excel file, the AI reads its
// layout, the code reads every row with it into a draft, and the draft prices nothing until a
// manager has checked and approved it. Which ports a tariff is for and whether it is import or
// export the manager ticks; the file does not decide it. Everyone may look.

// How many first rows of each sheet are kept for correcting the layout by hand: at least 30, and
// always a few price rows below the headings, however long the terms above them are.
const previewRows = (layout: RailLayout) => Math.min(Math.max(30, layout.firstDataRow + 5), 200);

const tonnes = (kg: number) => `${(Math.round(kg / 100) / 10).toLocaleString("en-US")} t`;

// Why a container line is not priced by its own weight, in words; null when it is.
function weightNote(c: RailPricedContainer): string | null {
  if (c.tareKg === null) return `${c.type}: not in the container tare list, so its gross weight is unknown - the lightest weight band of its length is used`;
  if (c.cargoKg === null) return `${c.type}: no cargo weight in Cargo details - the lightest weight band of its length is used; enter the weight for the right price`;
  return null;
}

// Why rows of the route could not price a container, in words.
function refusalNote(c: RailPricedContainer, reason: BandRefusal, rows: number): string {
  const which = rows === 1 ? "1 tariff row" : `${rows} tariff rows`;
  if (reason === "heavy") return `${which}: ${c.type} at ${tonnes(c.grossKg ?? 0)} gross is heavier than their weight bands - the operator prices it individually`;
  return `${which} have no price for ${c.type}`;
}

export interface RailUpload {
  supplierCustomerId: string;
  /** The tariff the file is a new version of; a new tariff of the supplier when left out. */
  tariffId?: string;
  /** A new tariff's ports and directions; needed when tariffId is left out, ignored otherwise. */
  ports?: TariffPortCode[];
  directions?: RailDirection[];
  fileName: string;
  fileBase64: string;
}

export interface RailOperatorDetail {
  operator: RailOperatorItem;
  tariffs: RailTariffItem[];
}

export interface RailTariffFields {
  id: string;
  name: string;
  ports: TariffPortCode[];
  directions: RailDirection[];
}

/** A quote's route and containers, as Sales asks the rail tariffs for offers. */
export interface RailOffersQuery {
  /** The sea port: the quote's port of discharge on an import, of loading on an export */
  port: TariffPortCode;
  direction: RailDirection;
  /** The inland place: a text with a postcode in it ("602 00", an address), or a town's name */
  place: string;
  /** ISO 3166-1 alpha-2 of the inland place; CZ when left out */
  country?: string;
  /** YYYY-MM-DD the prices must be valid on */
  date: string;
  containers: RailOfferContainer[];
}

export interface RailOffersResult {
  /** Every tariff row on the route that prices all the containers, cheapest first */
  offers: RailOffer[];
  /** The containers as the tariffs count them */
  containers: RailPricedContainer[];
  /** How the place was looked for; null when no place was given */
  matchedBy: RailOfferMatch | null;
  /** What to know about the offers: a weight that is missing, rows that could not price a container */
  notes: string[];
}

export interface RailRatePage {
  rates: RailRate[];
  /** How many rows match the filter */
  total: number;
  /** The terminals the version's rows run via */
  vias: string[];
}

const rateOf = (r: RailRateRecord): RailRate => ({
  id: r.id,
  rowNo: r.rowNo,
  country: r.country,
  postcode: r.postcode,
  postcodeFrom: r.postcodeFrom,
  postcodeTo: r.postcodeTo,
  place: r.place,
  region: r.region,
  via: r.via,
  emptyDepot: r.emptyDepot,
  note: r.note,
  validFrom: r.validFrom,
  validTo: r.validTo,
  prices: r.prices,
});

// The rows a layout reads from the file, and what a draft is saved with besides them.
function convertDraft(sheets: Sheet[], layout: RailLayout): { rows: RailRateRow[]; fields: ReadFields } {
  const problem = layoutProblem(layout, sheets);
  const sheet = sheets.find((s) => s.name === layout.sheet);
  const { rows, findings } = problem || !sheet ? { rows: [], findings: [unusableLayout(problem ?? "")] } : convertRail(sheet, layout);
  const preview = sheets.map((s) => sheetPreview(s, previewRows(layout)));
  return { rows, fields: readFields({ layout, currency: layout.currency, findings, rowCount: rows.length }, preview) };
}

const operatorOf = (s: SupplierTariffs, day: string): RailOperatorItem => ({ ...supplierGlance(s, day), ...portsAndDirectionsOf(s.tariffs) });

class RailTariffService {
  /** The rail operators with their tariffs at a glance, by company name. */
  async operators(companyId: string): Promise<RailOperatorItem[]> {
    const today = businessToday();
    return (await supplierTariffs(companyId, "rail")).map((s) => operatorOf(s, today));
  }

  /** One rail operator with all its tariffs and their versions. */
  async operator(companyId: string, customerId: string): Promise<RailOperatorDetail> {
    const [found] = await supplierTariffs(companyId, "rail", [customerId]);
    if (!found) throw APIError.notFound("This company is not a rail operator in the Customer Database");
    return {
      operator: operatorOf(found, businessToday()),
      tariffs: found.tariffs.map((t) => ({
        id: t.id,
        name: t.name,
        mode: t.mode,
        supplierCustomerId: t.supplierCustomerId,
        ports: t.ports,
        directions: t.directions,
        versions: found.versions.filter((v) => v.tariffId === t.id).map(summaryOf),
      })),
    };
  }

  /** Reads an uploaded tariff file into a new draft: the AI reads its layout, the code every row. */
  async upload(actor: Actor, req: RailUpload): Promise<SupplierTariffVersionDetail> {
    const file = uploadedFile(req);
    const { supplier, tariff } = await uploadTarget(actor.companyID, "rail", req.supplierCustomerId, req.tariffId);
    // Checked before the AI is asked: a new tariff cannot be saved without them.
    const newTariff = tariff ? null : chosenPortsAndDirections(req.ports, req.directions);

    const sheets = await sheetsOf(file.bytes, file.fileName);
    const previous = (tariff?.layout ?? null) as RailLayout | null;
    const layout = await readRailLayout(sheets, previous);
    const { rows, fields } = convertDraft(sheets, layout);
    const versionId = await saveDraft(
      actor,
      file,
      tariff ? { tariffId: tariff.id } : { supplierCustomerId: supplier.id, mode: "rail", name: layout.name, ...newTariff! },
      { ...fields, layoutSource: previous ? "remembered" : "ai" },
      rows,
    );
    return this.version(actor.companyID, versionId);
  }

  /** A version with its layout, findings and the first rows of the file. */
  async version(companyId: string, versionId: string): Promise<SupplierTariffVersionDetail> {
    const { v, t } = await versionOfMode(companyId, versionId, "rail");
    const layout = v.layout as RailLayout;
    const [supplier] = await suppliersOf("rail", [t.supplierCustomerId]);
    const tariff: TariffRef = {
      id: t.id,
      name: t.name,
      mode: t.mode,
      supplierCustomerId: t.supplierCustomerId,
      supplierName: supplier?.companyName ?? "",
      ports: t.ports,
      directions: t.directions,
    };
    return { ...summaryOf(v), tariff, layout, bandCodes: layout.bands.map(bandCode), findings: v.findings, preview: v.preview };
  }

  /** Reads a draft's file again with a corrected layout; its rows and findings are replaced. */
  async relayout(companyId: string, versionId: string, input: RailLayout): Promise<SupplierTariffVersionDetail> {
    const layout = parseRailLayout(input);
    const { v } = await versionOfMode(companyId, versionId, "rail");
    const { rows, fields } = convertDraft(await draftSheets(v), layout);
    await replaceDraft(companyId, versionId, fields, rows);
    return this.version(companyId, versionId);
  }

  /** Approves a draft without errors: it prices from its start date, earlier versions give way. */
  async approve(actor: Actor, versionId: string): Promise<SupplierTariffVersionDetail> {
    await versionOfMode(actor.companyID, versionId, "rail");
    await approveVersion(actor, versionId);
    return this.version(actor.companyID, versionId);
  }

  /** Throws a draft away; the file stays in storage with the soft-deleted version. */
  async discard(companyId: string, versionId: string): Promise<void> {
    await discardVersion(companyId, versionId, "rail");
  }

  /** A page of a version's rows, searched and filtered by terminal. */
  async rates(companyId: string, versionId: string, filter: RateFilter): Promise<RailRatePage> {
    await versionOfMode(companyId, versionId, "rail");
    const [{ rows, total }, vias] = await Promise.all([tariffRepository.rates(companyId, versionId, filter), tariffRepository.vias(companyId, versionId)]);
    return { rates: rows.map(rateOf), total, vias };
  }

  /**
   * The offers of the rail tariffs for a route: every row of an approved version valid on the day,
   * of a tariff for the port and direction, at the inland place, that prices all the containers -
   * each container by the lightest weight band its gross weight (cargo + tare) fits. Cheapest first;
   * rows that ask the same of the same operator's tariff via the same terminal are shown once.
   */
  async offers(companyId: string, req: RailOffersQuery): Promise<RailOffersResult> {
    if (!TARIFF_PORT_CODES.includes(req.port)) throw APIError.invalidArgument("This port has no rail tariffs");
    if (req.direction !== "import" && req.direction !== "export") throw APIError.invalidArgument("The direction is import or export");
    if (!isRealYmd(req.date)) throw APIError.invalidArgument("The date must be a day YYYY-MM-DD");
    const country = (req.country ?? "CZ").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw APIError.invalidArgument("The country is a 2-letter code, e.g. CZ");
    if (!req.containers.length) throw APIError.invalidArgument("Add the containers in Cargo details first");
    if (req.containers.length > 20) throw APIError.invalidArgument("At most 20 container lines are priced at once");
    for (const c of req.containers) {
      if (!Number.isInteger(c.qty) || c.qty < 1 || c.qty > 999) throw APIError.invalidArgument(`${c.type}: the number of containers must be 1 to 999`);
      if (c.cargoKg !== null && !(c.cargoKg >= 0 && c.cargoKg <= 100_000)) throw APIError.invalidArgument(`${c.type}: the cargo weight must be 0 to 100,000 kg`);
    }

    const containers = pricedContainers(req.containers);
    const notes = containers.map(weightNote).filter((n): n is string => n !== null);
    const place = placeQuery(req.place);
    if (!place) return { offers: [], containers, matchedBy: null, notes };

    const rows = await tariffRepository.ratesOnRoute(companyId, { port: req.port, direction: req.direction, date: req.date, country, place });
    const operators = new Map((await suppliersOf("rail", [...new Set(rows.map((r) => r.supplierCustomerId))])).map((o) => [o.id, o.companyName]));
    const refused = new Map<string, { container: number; reason: BandRefusal; rows: number }>();
    const seen = new Set<string>();
    const offers: RailOffer[] = [];
    for (const row of rows) {
      // A company that is no rail operator any more has no tariffs to offer, as on the Tariffs pages.
      const supplierName = operators.get(row.supplierCustomerId);
      if (supplierName === undefined) continue;
      const offer = rowOffer(row.bands, row.prices, containers);
      if (!offer.ok) {
        const key = `${offer.container}:${offer.reason}`;
        const entry = refused.get(key) ?? { container: offer.container, reason: offer.reason, rows: 0 };
        refused.set(key, { ...entry, rows: entry.rows + 1 });
        continue;
      }
      const same = `${row.versionId}|${row.via}|${row.emptyDepot}|${offer.lines.map((l) => `${l.bandCode}:${l.price}`).join(",")}`;
      if (seen.has(same)) continue;
      seen.add(same);
      offers.push({
        rateId: row.id,
        versionId: row.versionId,
        versionNo: row.versionNo,
        tariffId: row.tariffId,
        tariffName: row.tariffName,
        supplierCustomerId: row.supplierCustomerId,
        supplierName,
        currency: row.currency,
        place: row.place,
        postcode: row.postcode,
        region: row.region,
        via: row.via,
        emptyDepot: row.emptyDepot,
        note: row.note,
        validTo: row.versionValidTo,
        lines: offer.lines,
        total: offer.total,
      });
    }
    offers.sort((a, b) => a.total - b.total || a.supplierName.localeCompare(b.supplierName) || a.via.localeCompare(b.via));
    for (const r of refused.values()) notes.push(refusalNote(containers[r.container]!, r.reason, r.rows));
    return { offers, containers, matchedBy: "postcode" in place ? "postcode" : "place", notes };
  }

  /** The file a version was read from. */
  async source(companyId: string, versionId: string): Promise<TariffFile> {
    return sourceFile(companyId, versionId, "rail");
  }

  /** Changes a tariff's name, ports and directions; its versions and prices stay as they are. */
  async update(companyId: string, tariffId: string, req: { name: string; ports: TariffPortCode[]; directions: RailDirection[] }): Promise<RailTariffFields> {
    const name = tariffName(req.name);
    const chosen = chosenPortsAndDirections(req.ports, req.directions);
    const row = await updateTariff(companyId, tariffId, "rail", { name, ...chosen });
    return { id: row.id, name: row.name, ports: row.ports, directions: row.directions };
  }
}

export const railTariffService = new RailTariffService();
