import { createHash } from "node:crypto";
import { APIError } from "encore.dev/api";
import { customers } from "~encore/clients";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
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
  TariffFinding,
  SheetPreview,
  TariffPortCode,
  TariffRef,
  SupplierTariffVersionDetail,
} from "../interfaces/interfaces";
import { bandCode, convertRail, findingTotals } from "../lib/railConvert";
import { layoutProblem, parseRailLayout } from "../lib/railLayout";
import { placeQuery, pricedContainers, rowOffer, type BandRefusal } from "../lib/railOffers";
import { TARIFF_PORT_CODES, chosenPortsAndDirections, portsAndDirectionsOf } from "../lib/tariffPorts";
import { sheetPreview, type Sheet } from "../lib/sheet";
import { tariffRepository, type DraftFields, type RateFilter } from "../repositories/tariff.repository";
import type { RailRateRecord, TariffRecord } from "../schemas/tariff.schema";
import { tariffFileBucket } from "../storage/tariffFileBucket";
import { readRailLayout } from "./railLayoutReader.service";
import {
  businessToday,
  dropSource,
  isRealDay,
  pricesOn,
  requireId,
  sheetsOf,
  sourceFile,
  storeSource,
  summaryOf,
  tariffOfMode,
  uploadedFile,
  userName,
  versionOfMode,
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

// The rail operators of the caller's company (Customer Database companies with the role), or those of `ids`.
async function railOperators(ids?: string[]) {
  const { companies } = await customers._internalCompaniesWithRole({ role: "rail_operator", ids });
  return companies;
}

// The rows a layout reads from the file, and what a draft is saved with besides them.
function convertDraft(sheets: Sheet[], layout: RailLayout): { rows: RailRateRow[]; fields: Omit<DraftFields, "layoutSource" | "preview"> & { preview: SheetPreview[] } } {
  const problem = layoutProblem(layout, sheets);
  const sheet = sheets.find((s) => s.name === layout.sheet);
  const unusable: TariffFinding = { level: "error", code: "layout_unusable", message: problem ?? "", count: 1, rows: [] };
  const { rows, findings } = problem || !sheet ? { rows: [], findings: [unusable] } : convertRail(sheet, layout);
  const totals = findingTotals(findings);
  return {
    rows,
    fields: {
      validFrom: layout.validFrom,
      validTo: layout.validTo,
      currency: layout.currency,
      layout,
      findings,
      preview: sheets.map((s) => sheetPreview(s, previewRows(layout))),
      rowCount: rows.length,
      warningCount: totals.warnings,
      errorCount: totals.errors,
    },
  };
}

class RailTariffService {
  /** The rail operators with their tariffs at a glance, by company name. */
  async operators(companyId: string): Promise<RailOperatorItem[]> {
    const companies = await railOperators();
    if (!companies.length) return [];
    const tariffs = await tariffRepository.list(companyId, "rail", companies.map((c) => c.id));
    const versions = await tariffRepository.versionsOf(companyId, tariffs.map((t) => t.id));
    const today = businessToday();
    return companies.map((c) => {
      const ownTariffs = tariffs.filter((t) => t.supplierCustomerId === c.id);
      const own = new Set(ownTariffs.map((t) => t.id));
      const mine = versions.filter((v) => own.has(v.tariffId));
      const pricing = mine.filter((v) => pricesOn(v, today));
      const ends = pricing.map((v) => v.validTo).filter((d): d is string => d !== null);
      return {
        customerId: c.id,
        companyName: c.companyName,
        ico: c.ico,
        city: c.city,
        country: c.country,
        tariffCount: own.size,
        ...portsAndDirectionsOf(ownTariffs),
        activeCount: pricing.length,
        draftCount: mine.filter((v) => v.status === "draft").length,
        activeUntil: ends.length ? ends.sort()[0]! : null,
      };
    });
  }

  /** One rail operator with all its tariffs and their versions. */
  async operator(companyId: string, customerId: string): Promise<RailOperatorDetail> {
    const operator = (await this.operators(companyId)).find((o) => o.customerId === customerId);
    if (!operator) throw APIError.notFound("This company is not a rail operator in the Customer Database");
    const tariffs = await tariffRepository.list(companyId, "rail", [customerId]);
    const versions = await tariffRepository.versionsOf(companyId, tariffs.map((t) => t.id));
    return {
      operator,
      tariffs: tariffs.map((t) => ({
        id: t.id,
        name: t.name,
        mode: t.mode,
        supplierCustomerId: t.supplierCustomerId,
        ports: t.ports,
        directions: t.directions,
        versions: versions.filter((v) => v.tariffId === t.id).map(summaryOf),
      })),
    };
  }

  /** Reads an uploaded tariff file into a new draft: the AI reads its layout, the code every row. */
  async upload(actor: Actor, req: RailUpload): Promise<SupplierTariffVersionDetail> {
    const { companyID: companyId, userID: userId } = actor;
    const { fileName, bytes } = uploadedFile(req);

    const [supplier] = await railOperators([req.supplierCustomerId]);
    if (!supplier) throw APIError.notFound("This company is not a rail operator in the Customer Database");
    let tariff: TariffRecord | null = null;
    if (req.tariffId) {
      tariff = isUuid(req.tariffId) ? await tariffRepository.get(companyId, req.tariffId) : null;
      if (!tariff || tariff.mode !== "rail" || tariff.supplierCustomerId !== supplier.id) throw APIError.notFound("This tariff is not one of the rail operator's");
    }
    // Checked before the AI is asked: a new tariff cannot be saved without them.
    const newTariff = tariff ? null : chosenPortsAndDirections(req.ports, req.directions);

    const sheets = await sheetsOf(bytes, fileName);
    const previous = (tariff?.layout ?? null) as RailLayout | null;
    const layout = await readRailLayout(sheets, previous);
    const { rows, fields } = convertDraft(sheets, layout);

    const key = await storeSource(companyId, fileName, bytes);
    const by = await userName(userId);
    try {
      const version = await tariffRepository.createDraft(
        companyId,
        tariff ? { tariffId: tariff.id } : { supplierCustomerId: supplier.id, mode: "rail", name: layout.name, ...newTariff! },
        {
          ...fields,
          layoutSource: previous ? "remembered" : "ai",
          sourceFileName: fileName,
          sourceSha256: createHash("sha256").update(bytes).digest("hex"),
          sourceKey: key,
          createdByUserId: userId,
          createdBy: by,
        },
        rows,
      );
      return this.version(companyId, version.id);
    } catch (err) {
      await dropSource(key);
      throw err;
    }
  }

  /** A version with its layout, findings and the first rows of the file. */
  async version(companyId: string, versionId: string): Promise<SupplierTariffVersionDetail> {
    const { v, t } = await versionOfMode(companyId, versionId, "rail");
    const layout = v.layout as RailLayout;
    const [supplier] = await railOperators([t.supplierCustomerId]);
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
    if (v.status !== "draft") throw APIError.failedPrecondition("Only a draft's layout can be changed");
    if (!v.sourceKey) throw APIError.failedPrecondition("This version has no file to read again");
    const sheets = await sheetsOf(await tariffFileBucket.download(v.sourceKey), v.sourceFileName ?? "tariff.xlsx");
    const { rows, fields } = convertDraft(sheets, layout);
    const updated = await tariffRepository.replaceDraft(companyId, versionId, { ...fields, layoutSource: "edited" }, rows);
    if (!updated) throw APIError.failedPrecondition("This version is not a draft any more");
    return this.version(companyId, versionId);
  }

  /** Approves a draft without errors: it prices from its start date, earlier versions give way. */
  async approve(actor: Actor, versionId: string): Promise<SupplierTariffVersionDetail> {
    await versionOfMode(actor.companyID, versionId, "rail");
    const by = (await userName(actor.userID)) ?? "";
    const result = await tariffRepository.approve(actor.companyID, requireId(versionId, "Tariff version"), by);
    if (!result.ok) {
      if (result.reason === "not_found") throw APIError.notFound("Tariff version not found");
      throw APIError.failedPrecondition(result.reason);
    }
    return this.version(actor.companyID, versionId);
  }

  /** Throws a draft away; the file stays in storage with the soft-deleted version. */
  async discard(companyId: string, versionId: string): Promise<void> {
    await versionOfMode(companyId, versionId, "rail");
    if (!(await tariffRepository.discard(companyId, requireId(versionId, "Tariff version")))) throw APIError.failedPrecondition("Only a draft can be discarded");
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
    if (!isRealDay(req.date)) throw APIError.invalidArgument("The date must be a day YYYY-MM-DD");
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
    const operators = new Map((await railOperators([...new Set(rows.map((r) => r.supplierCustomerId))])).map((o) => [o.id, o.companyName]));
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
    return sourceFile((await versionOfMode(companyId, versionId, "rail")).v);
  }

  /** Changes a tariff's name, ports and directions; its versions and prices stay as they are. */
  async update(companyId: string, tariffId: string, req: { name: string; ports: TariffPortCode[]; directions: RailDirection[] }): Promise<RailTariffFields> {
    const name = req.name.trim();
    if (!name) throw APIError.invalidArgument("The tariff needs a name");
    const chosen = chosenPortsAndDirections(req.ports, req.directions);
    await tariffOfMode(companyId, tariffId, "rail");
    const row = await tariffRepository.update(companyId, tariffId, { name: name.slice(0, 200), ...chosen });
    if (!row) throw APIError.notFound("Tariff not found");
    return { id: row.id, name: row.name, ports: row.ports, directions: row.directions };
  }
}

export const railTariffService = new RailTariffService();
