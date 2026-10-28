import { createHash } from "node:crypto";
import { APIError } from "encore.dev/api";
import { customers } from "~encore/clients";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import type {
  CollectionConsignment,
  CollectionFreightMode,
  CollectionHaulierItem,
  CollectionHub,
  CollectionLayout,
  CollectionOffer,
  CollectionPrice,
  CollectionTableView,
  CollectionTariffItem,
  CollectionTariffVersionDetail,
  CollectionTry,
  SheetPreview,
  TariffFile,
  TariffFinding,
} from "../interfaces/interfaces";
import { convertCollection } from "../lib/collectionConvert";
import { collectionLayoutProblem, parseCollectionLayout } from "../lib/collectionLayout";
import { matrixFor, priceIn, zoneFor, type PricingRow } from "../lib/collectionPricing";
import { findingTotals } from "../lib/railConvert";
import { sheetPreview, type Sheet } from "../lib/sheet";
import { tariffRepository, type DraftFields } from "../repositories/tariff.repository";
import type { CollectionRateRecord, TariffRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { tariffFileBucket } from "../storage/tariffFileBucket";
import { readCollectionLayout } from "./collectionLayoutReader.service";
import {
  businessToday,
  dropSource,
  isRealDay,
  pricesOn,
  sheetsOf,
  sourceFile,
  storeSource,
  summaryOf,
  tariffOfMode,
  uploadedFile,
  userName,
  versionOfMode,
} from "./tariffFiles";

// First / last mile hauliers' tariffs (Tariffs → Last / First Mile Collections): a manager uploads
// the haulier's own Excel file, the AI reads where each part is kept, the code reads every figure
// into a draft, and a manager approves it. Approved versions price the collection and delivery of
// LCL and air consignments between our hub and the customer (Sales → Pricing). Everyone may look.

export const FREIGHT_MODES: readonly CollectionFreightMode[] = ["sea_lcl", "air"];
const FREIGHT_LABEL: Record<CollectionFreightMode, string> = { sea_lcl: "Sea LCL", air: "Air" };

// How many first rows of each sheet are kept for correcting the layout by hand.
const PREVIEW_ROWS = 40;

/** A postcode as typed ("252 61", "25261") as its 5 digits; null when it is none. */
export const postcodeOf = (text: string | null | undefined): string | null => {
  const digits = (text ?? "").replace(/\s/g, "");
  return /^\d{5}$/.test(digits) ? digits : null;
};
const showPostcode = (p: string) => `${p.slice(0, 3)} ${p.slice(3)}`;

export interface CollectionUpload {
  supplierCustomerId: string;
  /** The tariff the file is a new version of; a new tariff of the haulier when left out. */
  tariffId?: string;
  /** A new tariff's freight; needed when tariffId is left out, ignored otherwise. */
  freightModes?: CollectionFreightMode[];
  fileName: string;
  fileBase64: string;
}

export interface CollectionHaulierDetail {
  haulier: CollectionHaulierItem;
  tariffs: CollectionTariffItem[];
}

export interface CollectionTariffFields {
  id: string;
  name: string;
  freightModes: CollectionFreightMode[];
}

/** A consignment and its route, as one version is tried with or the tariffs are asked for offers. */
export interface CollectionRoute extends CollectionConsignment {
  /** Our hub's postcode */
  hubPostcode: string;
  /** The customer's postcode */
  customerPostcode: string;
}

export interface CollectionOffersQuery extends CollectionConsignment {
  freightMode: CollectionFreightMode;
  /** Our hub's postcode; the hub set for the freight mode when left out */
  hubPostcode?: string;
  customerPostcode: string;
  /** YYYY-MM-DD the prices must be valid on */
  date: string;
}

export interface CollectionOffersResult {
  /** Every haulier's price for the consignment, cheapest first */
  offers: CollectionOffer[];
  /** The hub postcode used; null when none is set or typed */
  hubPostcode: string | null;
  /** Why some tariffs have no price, and what is missing */
  notes: string[];
}

/** The freight modes chosen for a tariff, each once and in list order; refused when none or one unknown. */
export function chosenFreightModes(modes: readonly string[] | undefined): CollectionFreightMode[] {
  const unknown = (modes ?? []).find((m) => !FREIGHT_MODES.includes(m as CollectionFreightMode));
  if (unknown) throw APIError.invalidArgument(`"${unknown}" is neither Sea LCL nor Air`);
  const chosen = FREIGHT_MODES.filter((m) => modes?.includes(m));
  if (!chosen.length) throw APIError.invalidArgument("Choose what the tariff collects and delivers: Sea LCL, Air or both");
  return chosen;
}

// The first / last mile hauliers of the caller's company (Customer Database companies with the role), or those of `ids`.
async function hauliersWithRole(ids?: string[]) {
  const { companies } = await customers._internalCompaniesWithRole({ role: "first_last_mile_haulier", ids });
  return companies;
}

const layoutOf = (v: TariffVersionRecord) => v.layout as CollectionLayout;

// What a layout reads from the file, and what a draft is saved with besides it.
function convertDraft(sheets: Sheet[], layout: CollectionLayout) {
  const problem = collectionLayoutProblem(layout, sheets);
  const unusable: TariffFinding = { level: "error", code: "layout_unusable", message: problem ?? "", count: 1, rows: [] };
  const { data, findings } = problem ? { data: { rates: [], regions: [], distances: [], areas: [] }, findings: [unusable] } : convertCollection(sheets, layout);
  const totals = findingTotals(findings);
  const fields: Omit<DraftFields, "layoutSource" | "preview"> & { preview: SheetPreview[] } = {
    validFrom: layout.validFrom,
    validTo: layout.validTo,
    currency: layout.currency,
    layout,
    findings,
    preview: sheets.map((s) => sheetPreview(s, PREVIEW_ROWS)),
    rowCount: data.rates.length,
    warningCount: totals.warnings,
    errorCount: totals.errors,
  };
  return { data, fields };
}

const pricingRows = (rows: CollectionRateRecord[]): PricingRow[] => rows.map((r) => ({ matrix: r.matrix, weightToKg: r.weightToKg, volumeToCbm: r.volumeToCbm, prices: r.prices }));

type VersionPrice = { ok: true; price: CollectionPrice; hubPlace: string; customerPlace: string } | { ok: false; problem: string; hubPlace: string; customerPlace: string };

/**
 * What one version asks for a consignment between our hub and the customer. By distance: both
 * postcodes' regions in the tariff's own list, the km between them, the table of the customer's
 * country and the zone that km falls in. By postcode area: the customer's area, its zone and country.
 */
async function priceVersion(v: TariffVersionRecord, route: CollectionRoute): Promise<VersionPrice> {
  const layout = layoutOf(v);
  const hubPostcode = postcodeOf(route.hubPostcode);
  const customerPostcode = postcodeOf(route.customerPostcode);
  const none = (problem: string, hubPlace = "", customerPlace = ""): VersionPrice => ({ ok: false, problem, hubPlace, customerPlace });
  if (!customerPostcode) return none("the customer's postcode is not 5 digits");

  let matrix: number;
  let zone: number;
  let km: number | null = null;
  let hubPlace = "";
  let customerPlace = "";
  if (layout.zoneBy === "distance") {
    if (!hubPostcode) return none("our hub's postcode is not set");
    const [hub, customer] = await Promise.all([tariffRepository.regionOf(v.id, hubPostcode), tariffRepository.regionOf(v.id, customerPostcode)]);
    hubPlace = hub?.place ?? "";
    customerPlace = customer?.place ?? "";
    if (!hub) return none(`our hub's postcode ${showPostcode(hubPostcode)} is not in its postcode list`, hubPlace, customerPlace);
    if (!customer) return none(`postcode ${showPostcode(customerPostcode)} is not in its postcode list`, hubPlace, customerPlace);
    km = (await tariffRepository.distanceBetween(v.id, hub.region, customer.region)) ?? (hub.region === customer.region ? layout.sameRegionKm : null);
    if (km === null) return none(`its distance list has no km between regions ${hub.region} and ${customer.region}`, hubPlace, customerPlace);
    matrix = matrixFor(layout, customer.country);
    if (matrix < 0) return none(`it has no prices for ${customer.country}`, hubPlace, customerPlace);
    zone = zoneFor(layout, matrix, { km });
    const last = layout.matrices[matrix]!.zones.at(-1)?.kmTo;
    if (zone < 0) return none(`${km} km is further than its last zone (${last} km)`, hubPlace, customerPlace);
  } else {
    const area = await tariffRepository.areaOf(v.id, customerPostcode);
    if (!area) return none(`postcode ${showPostcode(customerPostcode)} is in none of its areas`);
    matrix = matrixFor(layout, area.country);
    if (matrix < 0) return none(`it has no prices for ${area.country}`);
    zone = zoneFor(layout, matrix, { zone: area.zone });
    if (zone < 0) return none(`its tables have no column for zone ${area.zone}`);
  }

  const rates = pricingRows(await tariffRepository.collectionRates(v.id));
  const priced = priceIn(layout, rates, matrix, zone, route, km);
  if (priced.ok) {
    const { ok: _, ...price } = priced;
    return { ok: true, price, hubPlace, customerPlace };
  }
  const why: Record<typeof priced.reason, string> = {
    no_weight: "the consignment has neither a weight nor a volume",
    too_heavy: `${priced.chargeableKg?.toLocaleString("en-US")} kg is over its heaviest band (${priced.maxKg?.toLocaleString("en-US")} kg): the haulier prices it individually`,
    too_big: "the volume is over its largest volume band: the haulier prices it individually",
    no_price: "it has no price for that weight in that zone",
  };
  return none(why[priced.reason], hubPlace, customerPlace);
}

// The price tables as read, lightest row first, for the version page.
function tablesOf(layout: CollectionLayout, rates: CollectionRateRecord[]): CollectionTableView[] {
  return layout.matrices.map((m, i) => ({
    label: m.label,
    country: m.country,
    zones: m.zones.map((z) => z.label),
    rows: rates.filter((r) => r.matrix === i).map((r) => ({ rowNo: r.rowNo, weightToKg: r.weightToKg, volumeToCbm: r.volumeToCbm, prices: r.prices })),
  }));
}

class CollectionTariffService {
  /** The first / last mile hauliers with their tariffs at a glance, by company name. */
  async hauliers(companyId: string): Promise<CollectionHaulierItem[]> {
    const companies = await hauliersWithRole();
    if (!companies.length) return [];
    const tariffs = await tariffRepository.list(companyId, "collection", companies.map((c) => c.id));
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
        freightModes: FREIGHT_MODES.filter((m) => ownTariffs.some((t) => t.freightModes.includes(m))),
        activeCount: pricing.length,
        draftCount: mine.filter((v) => v.status === "draft").length,
        activeUntil: ends.length ? ends.sort()[0]! : null,
      };
    });
  }

  /** One haulier with all its tariffs and their versions. */
  async haulier(companyId: string, customerId: string): Promise<CollectionHaulierDetail> {
    const haulier = (await this.hauliers(companyId)).find((h) => h.customerId === customerId);
    if (!haulier) throw APIError.notFound("This company is not a first / last mile haulier in the Customer Database");
    const tariffs = await tariffRepository.list(companyId, "collection", [customerId]);
    const versions = await tariffRepository.versionsOf(companyId, tariffs.map((t) => t.id));
    return {
      haulier,
      tariffs: tariffs.map((t) => ({
        id: t.id,
        name: t.name,
        supplierCustomerId: t.supplierCustomerId,
        freightModes: t.freightModes,
        versions: versions.filter((v) => v.tariffId === t.id).map(summaryOf),
      })),
    };
  }

  /** Reads an uploaded tariff file into a new draft: the AI reads where each part is, the code every figure. */
  async upload(actor: Actor, req: CollectionUpload): Promise<CollectionTariffVersionDetail> {
    const { companyID: companyId, userID: userId } = actor;
    const { fileName, bytes } = uploadedFile(req);
    const [supplier] = await hauliersWithRole([req.supplierCustomerId]);
    if (!supplier) throw APIError.notFound("This company is not a first / last mile haulier in the Customer Database");
    let tariff: TariffRecord | null = null;
    if (req.tariffId) {
      tariff = isUuid(req.tariffId) ? await tariffRepository.get(companyId, req.tariffId) : null;
      if (!tariff || tariff.mode !== "collection" || tariff.supplierCustomerId !== supplier.id) throw APIError.notFound("This tariff is not one of the haulier's");
    }
    // Checked before the AI is asked: a new tariff cannot be saved without them.
    const freightModes = tariff ? null : chosenFreightModes(req.freightModes);

    const sheets = await sheetsOf(bytes, fileName, { hidden: true });
    const previous = (tariff?.layout ?? null) as CollectionLayout | null;
    const layout = await readCollectionLayout(sheets, previous);
    const { data, fields } = convertDraft(sheets, layout);

    const key = await storeSource(companyId, fileName, bytes);
    const by = await userName(userId);
    try {
      const version = await tariffRepository.createDraft(
        companyId,
        tariff ? { tariffId: tariff.id } : { supplierCustomerId: supplier.id, mode: "collection", name: layout.name, ports: [], directions: [], freightModes: freightModes! },
        {
          ...fields,
          layoutSource: previous ? "remembered" : "ai",
          sourceFileName: fileName,
          sourceSha256: createHash("sha256").update(bytes).digest("hex"),
          sourceKey: key,
          createdByUserId: userId,
          createdBy: by,
        },
        data,
      );
      return this.version(companyId, version.id);
    } catch (err) {
      await dropSource(key);
      throw err;
    }
  }

  /** A version with its layout, findings, the first rows of the file, its price tables and how many rows it holds. */
  async version(companyId: string, versionId: string): Promise<CollectionTariffVersionDetail> {
    const { v, t } = await versionOfMode(companyId, versionId, "collection");
    const layout = layoutOf(v);
    const [[supplier], rates, counts] = await Promise.all([hauliersWithRole([t.supplierCustomerId]), tariffRepository.collectionRates(v.id), tariffRepository.collectionCounts(v.id)]);
    return {
      ...summaryOf(v),
      tariff: { id: t.id, name: t.name, supplierCustomerId: t.supplierCustomerId, supplierName: supplier?.companyName ?? "", freightModes: t.freightModes },
      layout,
      findings: v.findings,
      preview: v.preview,
      counts,
      tables: tablesOf(layout, rates),
    };
  }

  /** Reads a draft's file again with a corrected layout; its rows and findings are replaced. */
  async relayout(companyId: string, versionId: string, input: CollectionLayout): Promise<CollectionTariffVersionDetail> {
    const layout = parseCollectionLayout(input);
    const { v } = await versionOfMode(companyId, versionId, "collection");
    if (v.status !== "draft") throw APIError.failedPrecondition("Only a draft's layout can be changed");
    if (!v.sourceKey) throw APIError.failedPrecondition("This version has no file to read again");
    const sheets = await sheetsOf(await tariffFileBucket.download(v.sourceKey), v.sourceFileName ?? "tariff.xlsx", { hidden: true });
    const { data, fields } = convertDraft(sheets, layout);
    const updated = await tariffRepository.replaceDraft(companyId, versionId, { ...fields, layoutSource: "edited" }, data);
    if (!updated) throw APIError.failedPrecondition("This version is not a draft any more");
    return this.version(companyId, versionId);
  }

  /** Approves a draft without errors: it prices from its start date, earlier versions give way. */
  async approve(actor: Actor, versionId: string): Promise<CollectionTariffVersionDetail> {
    await versionOfMode(actor.companyID, versionId, "collection");
    const result = await tariffRepository.approve(actor.companyID, versionId, (await userName(actor.userID)) ?? "");
    if (!result.ok) {
      if (result.reason === "not_found") throw APIError.notFound("Tariff version not found");
      throw APIError.failedPrecondition(result.reason);
    }
    return this.version(actor.companyID, versionId);
  }

  /** Throws a draft away; the file stays in storage with the soft-deleted version. */
  async discard(companyId: string, versionId: string): Promise<void> {
    await versionOfMode(companyId, versionId, "collection");
    if (!(await tariffRepository.discard(companyId, versionId))) throw APIError.failedPrecondition("Only a draft can be discarded");
  }

  /** The file a version was read from. */
  async source(companyId: string, versionId: string): Promise<TariffFile> {
    return sourceFile((await versionOfMode(companyId, versionId, "collection")).v);
  }

  /** What one version (a draft too) asks for a consignment between two postcodes: "Try a route". */
  async tryRoute(companyId: string, versionId: string, route: CollectionRoute): Promise<CollectionTry> {
    const { v } = await versionOfMode(companyId, versionId, "collection");
    const priced = await priceVersion(v, route);
    return priced.ok
      ? { price: priced.price, problem: null, hubPlace: priced.hubPlace, customerPlace: priced.customerPlace }
      : { price: null, problem: priced.problem, hubPlace: priced.hubPlace, customerPlace: priced.customerPlace };
  }

  /**
   * Every first / last mile haulier's price for a consignment between our hub and the customer: the
   * approved versions valid on the day, of tariffs ticked for the freight. Cheapest first; the notes
   * say which tariffs could not price it and why.
   */
  async offers(companyId: string, req: CollectionOffersQuery): Promise<CollectionOffersResult> {
    if (!FREIGHT_MODES.includes(req.freightMode)) throw APIError.invalidArgument("The freight is Sea LCL or Air");
    if (!isRealDay(req.date)) throw APIError.invalidArgument("The date must be a day YYYY-MM-DD");
    for (const [name, value, max] of [["weight", req.weightKg, 1_000_000], ["volume", req.cbm, 10_000], ["longest piece", req.longestCm, 100_000]] as const) {
      if (value !== null && !(value >= 0 && value <= max)) throw APIError.invalidArgument(`The ${name} must be 0 to ${max.toLocaleString("en-US")}`);
    }
    const notes: string[] = [];
    const hub = req.hubPostcode?.trim() ? req.hubPostcode : (await tariffRepository.hubs(companyId)).find((h) => h.freightMode === req.freightMode)?.postcode;
    if (!postcodeOf(hub)) notes.push(`Our hub for ${FREIGHT_LABEL[req.freightMode]} is not set: a manager sets it on Tariffs → Last / First Mile Collections`);
    if (!postcodeOf(req.customerPostcode)) return { offers: [], hubPostcode: postcodeOf(hub), notes: [...notes, "Type the customer's 5-digit postcode"] };

    const candidates = await tariffRepository.collectionCandidates(companyId, req.freightMode, req.date);
    const names = new Map((await hauliersWithRole([...new Set(candidates.map((c) => c.tariff.supplierCustomerId))])).map((h) => [h.id, h.companyName]));
    const route: CollectionRoute = { ...req, hubPostcode: hub ?? "" };
    const offers: CollectionOffer[] = [];
    for (const { version, tariff } of candidates) {
      // A company that is no first / last mile haulier any more has no tariffs to offer.
      const supplierName = names.get(tariff.supplierCustomerId);
      if (supplierName === undefined) continue;
      const priced = await priceVersion(version, route);
      if (!priced.ok) {
        notes.push(`${supplierName} (${tariff.name}): ${priced.problem}`);
        continue;
      }
      offers.push({
        ...priced.price,
        versionId: version.id,
        versionNo: version.versionNo,
        tariffId: tariff.id,
        tariffName: tariff.name,
        supplierCustomerId: tariff.supplierCustomerId,
        supplierName,
        validTo: version.validTo,
        hubPlace: priced.hubPlace,
        customerPlace: priced.customerPlace,
      });
    }
    offers.sort((a, b) => a.total - b.total || a.supplierName.localeCompare(b.supplierName));
    if (!candidates.length) notes.push(`No approved collections tariff for ${FREIGHT_LABEL[req.freightMode]} is valid on ${req.date}`);
    return { offers, hubPostcode: postcodeOf(hub), notes };
  }

  async hubs(companyId: string): Promise<CollectionHub[]> {
    return tariffRepository.hubs(companyId);
  }

  /** Sets our hub for a freight mode (manager). */
  async setHub(actor: Actor, hub: CollectionHub): Promise<CollectionHub> {
    if (!FREIGHT_MODES.includes(hub.freightMode)) throw APIError.invalidArgument("The freight is Sea LCL or Air");
    const postcode = postcodeOf(hub.postcode);
    if (!postcode) throw APIError.invalidArgument("The hub's postcode must be 5 digits, e.g. 252 61");
    const country = hub.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw APIError.invalidArgument("The country is a 2-letter code, e.g. CZ");
    const saved: CollectionHub = { freightMode: hub.freightMode, postcode, country, label: hub.label.trim().slice(0, 100) };
    await tariffRepository.setHub(actor.companyID, saved, await userName(actor.userID));
    return saved;
  }

  /** Changes a tariff's name and freight; its versions and prices stay as they are. */
  async update(companyId: string, tariffId: string, req: { name: string; freightModes: CollectionFreightMode[] }): Promise<CollectionTariffFields> {
    const name = req.name.trim();
    if (!name) throw APIError.invalidArgument("The tariff needs a name");
    const freightModes = chosenFreightModes(req.freightModes);
    await tariffOfMode(companyId, tariffId, "collection");
    const row = await tariffRepository.update(companyId, tariffId, { name: name.slice(0, 200), freightModes });
    if (!row) throw APIError.notFound("Tariff not found");
    return { id: row.id, name: row.name, freightModes: row.freightModes };
  }
}

export const collectionTariffService = new CollectionTariffService();
