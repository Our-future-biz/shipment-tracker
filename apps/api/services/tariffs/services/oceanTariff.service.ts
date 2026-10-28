import { createHash } from "node:crypto";
import { APIError } from "encore.dev/api";
import { auth, customers } from "~encore/clients";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import type {
  OceanData,
  OceanLayout,
  OceanOffer,
  OceanPlace,
  OceanPort,
  RailDirection,
  SheetPreview,
  SupplierTariffVersion,
  TariffFile,
  TariffFinding,
} from "../interfaces/interfaces";
import { convertOcean, type PortNeed } from "../lib/oceanConvert";
import { oceanLayoutProblem, parseOceanLayout } from "../lib/oceanLayout";
import { countriesFor, nameVariants, placeFor, portCodeFor } from "../lib/oceanPorts";
import { oceanEquipmentOf, rateOffer, type OceanContainer } from "../lib/oceanPricing";
import { findingTotals } from "../lib/railConvert";
import { sheetPreview, type Sheet } from "../lib/sheet";
import { tariffRepository, type DraftFields } from "../repositories/tariff.repository";
import type { OceanPortRecord, TariffRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { tariffFileBucket } from "../storage/tariffFileBucket";
import { readOceanLayout } from "./oceanLayoutReader.service";
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

// Shipping lines' tariffs (Tariffs → Shipping Lines): a manager uploads the line's own Excel rate
// document, the AI reads where each rate table and surcharge rule is, the code reads every rate and
// matches the port names to the UN/LOCODE place list, a manager picks the ports it could not match
// and approves. Approved versions price a Sea FCL quote's ocean freight (Sales → Pricing).

const DIRECTIONS: readonly RailDirection[] = ["import", "export"];
const PREVIEW_ROWS = 40;
// The most candidates kept for a port name a user has to pick.
const MAX_CANDIDATES = 8;

/** A shipping line (a Customer Database company with the role) with its tariffs at a glance. */
export interface ShippingLineItem {
  customerId: string;
  companyName: string;
  ico: string;
  city: string;
  country: string;
  tariffCount: number;
  directions: RailDirection[];
  /** Versions that price today */
  activeCount: number;
  draftCount: number;
  /** The soonest end of an active version, YYYY-MM-DD; null when none ends */
  activeUntil: string | null;
}

export interface OceanTariffItem {
  id: string;
  name: string;
  supplierCustomerId: string;
  directions: RailDirection[];
  /** Newest first */
  versions: SupplierTariffVersion[];
}

export interface ShippingLineDetail {
  line: ShippingLineItem;
  tariffs: OceanTariffItem[];
}

export interface OceanTariffRef {
  id: string;
  name: string;
  supplierCustomerId: string;
  supplierName: string;
  directions: RailDirection[];
}

export interface OceanTariffVersionDetail extends SupplierTariffVersion {
  tariff: OceanTariffRef;
  layout: OceanLayout;
  findings: TariffFinding[];
  preview: SheetPreview[];
  /** Every port name of the file and what it means, those still to match first */
  ports: OceanPort[];
  /** How many port names are still to match: approval waits for them */
  pendingPorts: number;
}

/** An ocean rate as listed on the version page. */
export interface OceanRateView {
  id: string;
  table: number;
  rowNo: number;
  polName: string;
  polCode: string | null;
  podName: string;
  podCode: string | null;
  via: string;
  currency: string;
  prices: Record<string, number>;
  note: string;
}

export interface OceanRatePage {
  rates: OceanRateView[];
  /** How many rates match the filter */
  total: number;
}

export interface OceanUpload {
  supplierCustomerId: string;
  /** The tariff the file is a new version of; a new tariff of the line when left out. */
  tariffId?: string;
  /** A new tariff's import / export; needed when tariffId is left out, ignored otherwise. */
  directions?: RailDirection[];
  fileName: string;
  fileBase64: string;
}

export interface OceanOffersQuery {
  direction: RailDirection;
  /** The quote's port of loading, UN/LOCODE */
  polCode: string;
  /** The quote's port of discharge, UN/LOCODE */
  podCode: string;
  /** Every port of loading the tariffs have to the port of discharge, not only polCode */
  comparePols: boolean;
  /** YYYY-MM-DD the rates must be valid on */
  date: string;
  /** The quote's container lines */
  containers: { type: string; qty: number }[];
  /** The cargo is dangerous goods: IMO surcharges apply */
  dangerous: boolean;
}

export interface OceanOffersResult {
  /** Every way a shipping line takes the containers from port to port; the caller ranks them in its own currency */
  offers: OceanOffer[];
  /** What is not priced and why, the fees only charged on a manual booking, what is not included */
  notes: string[];
}

/** The directions chosen for a tariff, each once and in list order; refused when none or one unknown. */
export function chosenDirections(directions: readonly string[] | undefined): RailDirection[] {
  const unknown = (directions ?? []).find((d) => !DIRECTIONS.includes(d as RailDirection));
  if (unknown) throw APIError.invalidArgument(`"${unknown}" is neither import nor export`);
  const chosen = DIRECTIONS.filter((d) => directions?.includes(d));
  if (!chosen.length) throw APIError.invalidArgument("Choose whether the tariff is for import, export or both");
  return chosen;
}

// The shipping lines of the caller's company (Customer Database companies with the role), or those of `ids`.
async function linesWithRole(ids?: string[]) {
  const { companies } = await customers._internalCompaniesWithRole({ role: "shipping_line", ids });
  return companies;
}

const layoutOf = (v: TariffVersionRecord) => v.layout as OceanLayout;
const portKey = (side: string, name: string) => `${side}|${name}`;

const portOf = (p: OceanPortRecord): OceanPort => ({ side: p.side, name: p.name, countryHint: p.countryHint, code: p.code, status: p.status, candidates: p.candidates });

/**
 * What every port name of the file means. A name a user picked or left out on this tariff before
 * keeps that; one the tariff's own port codes name ("HAM") takes that code when the place list has
 * it; the rest are looked up in the place list by name (its ways of writing) and country - the
 * country the file names with it, else the countries of its table - and matched when only one place
 * can be meant. Those left are pending, with the places they could be.
 */
async function matchPorts(needs: PortNeed[], layout: OceanLayout, picks: Map<string, { code: string | null; status: OceanPort["status"] }>): Promise<OceanPort[]> {
  const byCodeAsked = new Set<string>();
  const lookups: { need: PortNeed; queries: { name: string; countryCode?: string }[] }[] = [];
  const fixed = new Map<string, string>();
  for (const need of needs) {
    const key = portKey(need.side, need.name);
    if (picks.has(key)) continue;
    const code = portCodeFor(need.name, layout.portCodes);
    if (code) {
      fixed.set(key, code);
      byCodeAsked.add(code);
      continue;
    }
    const countries = need.countryHint ? countriesFor([need.countryHint]) : [];
    const queries = nameVariants(need.name).flatMap((name) => (countries.length ? countries.map((countryCode) => ({ name, countryCode })) : [{ name }]));
    lookups.push({ need, queries });
  }
  const { byCode, candidates } = await auth.placeLookup({ codes: [...byCodeAsked], names: lookups.flatMap((l) => l.queries) });
  const known = new Set(byCode.map((p) => p.code));

  const answers = new Map<string, OceanPlace[]>();
  let at = 0;
  for (const l of lookups) {
    const found = l.queries.flatMap((_, i) => candidates[at + i] ?? []);
    at += l.queries.length;
    answers.set(portKey(l.need.side, l.need.name), [...new Map(found.map((p) => [p.code, p])).values()]);
  }

  return needs.map((need): OceanPort => {
    const key = portKey(need.side, need.name);
    const base = { side: need.side, name: need.name, countryHint: need.countryHint };
    const pick = picks.get(key);
    if (pick) return { ...base, code: pick.code, status: pick.status, candidates: [] };
    const code = fixed.get(key);
    if (code) return known.has(code) ? { ...base, code, status: "matched", candidates: [] } : { ...base, code: null, status: "pending", candidates: [] };
    const found = answers.get(key) ?? [];
    const countries = need.countryHint ? [need.countryHint] : need.countries;
    const place = placeFor(need.name, countries, found);
    if (place) return { ...base, code: place.code, status: "matched", candidates: [] };
    const allowed = countriesFor(countries);
    const ranked = [...found].sort((a, b) => Number(!allowed.includes(a.countryCode)) - Number(!allowed.includes(b.countryCode)));
    return { ...base, code: null, status: "pending", candidates: ranked.slice(0, MAX_CANDIDATES) };
  });
}

// What a layout reads from the file, with its ports matched, and what a draft is saved with besides it.
async function convertDraft(sheets: Sheet[], layout: OceanLayout, picks: Map<string, { code: string | null; status: OceanPort["status"] }>) {
  const problem = oceanLayoutProblem(layout, sheets);
  const unusable: TariffFinding = { level: "error", code: "layout_unusable", message: problem ?? "", count: 1, rows: [] };
  const read = problem ? { rates: [], ports: [], findings: [unusable] } : convertOcean(sheets, layout);
  const ports = await matchPorts(read.ports, layout, picks);
  const pending = ports.filter((p) => p.status === "pending").length;
  const findings: TariffFinding[] = pending
    ? [...read.findings, { level: "warning", code: "ports_pending", message: `${pending} port names are not matched to a place yet: pick each one (or leave it out) before approving`, count: pending, rows: [] }]
    : read.findings;
  const totals = findingTotals(findings);
  const data: OceanData = { rates: read.rates, ports };
  const fields: Omit<DraftFields, "layoutSource" | "preview"> & { preview: SheetPreview[] } = {
    validFrom: layout.validFrom,
    validTo: layout.validTo,
    currency: [...new Set(read.rates.map((r) => r.currency))].join("/") || "USD",
    layout,
    findings,
    preview: sheets.map((s) => sheetPreview(s, PREVIEW_ROWS)),
    rowCount: read.rates.length,
    warningCount: totals.warnings,
    errorCount: totals.errors,
  };
  return { data, fields };
}

// The picks of a tariff's versions, newest first, as the next reading takes them over.
async function picksOf(tariffId: string | null) {
  const picks = new Map<string, { code: string | null; status: OceanPort["status"] }>();
  if (!tariffId) return picks;
  for (const p of await tariffRepository.oceanPicks(tariffId)) {
    const key = portKey(p.side, p.name);
    if (!picks.has(key)) picks.set(key, { code: p.code, status: p.status });
  }
  return picks;
}

class OceanTariffService {
  /** The shipping lines with their tariffs at a glance, by company name. */
  async lines(companyId: string): Promise<ShippingLineItem[]> {
    const companies = await linesWithRole();
    if (!companies.length) return [];
    const tariffs = await tariffRepository.list(companyId, "ocean", companies.map((c) => c.id));
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
        directions: DIRECTIONS.filter((d) => ownTariffs.some((t) => t.directions.includes(d))),
        activeCount: pricing.length,
        draftCount: mine.filter((v) => v.status === "draft").length,
        activeUntil: ends.length ? ends.sort()[0]! : null,
      };
    });
  }

  /** One shipping line with all its tariffs and their versions. */
  async line(companyId: string, customerId: string): Promise<ShippingLineDetail> {
    const line = (await this.lines(companyId)).find((l) => l.customerId === customerId);
    if (!line) throw APIError.notFound("This company is not a shipping line in the Customer Database");
    const tariffs = await tariffRepository.list(companyId, "ocean", [customerId]);
    const versions = await tariffRepository.versionsOf(companyId, tariffs.map((t) => t.id));
    return {
      line,
      tariffs: tariffs.map((t) => ({ id: t.id, name: t.name, supplierCustomerId: t.supplierCustomerId, directions: t.directions, versions: versions.filter((v) => v.tariffId === t.id).map(summaryOf) })),
    };
  }

  /** Reads an uploaded rate document into a new draft: the AI reads where each part is, the code every rate and port. */
  async upload(actor: Actor, req: OceanUpload): Promise<OceanTariffVersionDetail> {
    const { companyID: companyId, userID: userId } = actor;
    const { fileName, bytes } = uploadedFile(req);
    const [supplier] = await linesWithRole([req.supplierCustomerId]);
    if (!supplier) throw APIError.notFound("This company is not a shipping line in the Customer Database");
    let tariff: TariffRecord | null = null;
    if (req.tariffId) {
      tariff = isUuid(req.tariffId) ? await tariffRepository.get(companyId, req.tariffId) : null;
      if (!tariff || tariff.mode !== "ocean" || tariff.supplierCustomerId !== supplier.id) throw APIError.notFound("This tariff is not one of the shipping line's");
    }
    // Checked before the AI is asked: a new tariff cannot be saved without them.
    const directions = tariff ? null : chosenDirections(req.directions);

    const sheets = await sheetsOf(bytes, fileName, { hidden: true });
    const previous = (tariff?.layout ?? null) as OceanLayout | null;
    const layout = await readOceanLayout(sheets, previous);
    const { data, fields } = await convertDraft(sheets, layout, await picksOf(tariff?.id ?? null));

    const key = await storeSource(companyId, fileName, bytes);
    const by = await userName(userId);
    try {
      const version = await tariffRepository.createDraft(
        companyId,
        tariff ? { tariffId: tariff.id } : { supplierCustomerId: supplier.id, mode: "ocean", name: layout.name, ports: [], directions: directions! },
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

  /** A version with its layout, findings, the first rows of the file, and its port names. */
  async version(companyId: string, versionId: string): Promise<OceanTariffVersionDetail> {
    const { v, t } = await versionOfMode(companyId, versionId, "ocean");
    const [[supplier], ports] = await Promise.all([linesWithRole([t.supplierCustomerId]), tariffRepository.oceanPorts(v.id)]);
    return {
      ...summaryOf(v),
      tariff: { id: t.id, name: t.name, supplierCustomerId: t.supplierCustomerId, supplierName: supplier?.companyName ?? "", directions: t.directions },
      layout: layoutOf(v),
      findings: v.findings,
      preview: v.preview,
      ports: ports.map(portOf),
      pendingPorts: ports.filter((p) => p.status === "pending").length,
    };
  }

  /** A page of a version's rates, searched by port and transshipment port, of one table when named. */
  async rates(companyId: string, versionId: string, filter: { search?: string; table?: number; offset: number; limit: number }): Promise<OceanRatePage> {
    const { v } = await versionOfMode(companyId, versionId, "ocean");
    const { rows, total } = await tariffRepository.oceanRates(v.id, filter);
    return {
      rates: rows.map((r) => ({
        id: r.id,
        table: r.tableNo,
        rowNo: r.rowNo,
        polName: r.polName,
        polCode: r.polCode,
        podName: r.podName,
        podCode: r.podCode,
        via: r.via,
        currency: r.currency,
        prices: r.prices as Record<string, number>,
        note: r.note,
      })),
      total,
    };
  }

  /** Reads a draft's file again with a corrected layout; its rates, ports and findings are replaced, the ports a user picked kept. */
  async relayout(companyId: string, versionId: string, input: OceanLayout): Promise<OceanTariffVersionDetail> {
    const layout = parseOceanLayout(input);
    const { v, t } = await versionOfMode(companyId, versionId, "ocean");
    if (v.status !== "draft") throw APIError.failedPrecondition("Only a draft's layout can be changed");
    if (!v.sourceKey) throw APIError.failedPrecondition("This version has no file to read again");
    const sheets = await sheetsOf(await tariffFileBucket.download(v.sourceKey), v.sourceFileName ?? "tariff.xlsx", { hidden: true });
    const { data, fields } = await convertDraft(sheets, layout, await picksOf(t.id));
    const updated = await tariffRepository.replaceDraft(companyId, versionId, { ...fields, layoutSource: "edited" }, data);
    if (!updated) throw APIError.failedPrecondition("This version is not a draft any more");
    return this.version(companyId, versionId);
  }

  /**
   * Sets what a port name of a draft means: a place a user picked (it must be in the place list),
   * or none, which leaves its rates out. The tariff's next versions take the pick over.
   */
  async setPort(companyId: string, versionId: string, req: { side: "pol" | "pod"; name: string; code: string | null }): Promise<OceanTariffVersionDetail> {
    const { v } = await versionOfMode(companyId, versionId, "ocean");
    if (v.status !== "draft") throw APIError.failedPrecondition("Only a draft's ports can be changed");
    const code = req.code?.trim().toUpperCase() || null;
    if (code) {
      const { byCode } = await auth.placeLookup({ codes: [code], names: [] });
      if (!byCode.length) throw APIError.invalidArgument(`${code} is not a place of the UN/LOCODE list`);
    }
    if (!(await tariffRepository.setOceanPort(v.id, req.side, req.name, code))) throw APIError.notFound("This version has no such port name");
    // The "ports pending" finding follows what is left to pick.
    const pending = await tariffRepository.pendingOceanPorts(v.id);
    const others = v.findings.filter((f) => f.code !== "ports_pending");
    const findings: TariffFinding[] = pending
      ? [...others, { level: "warning", code: "ports_pending", message: `${pending} port names are not matched to a place yet: pick each one (or leave it out) before approving`, count: pending, rows: [] }]
      : others;
    const totals = findingTotals(findings);
    await tariffRepository.replaceFindings(companyId, v.id, findings, totals);
    return this.version(companyId, versionId);
  }

  /** Approves a draft without errors and with every port matched: it prices from its start date, earlier versions give way. */
  async approve(actor: Actor, versionId: string): Promise<OceanTariffVersionDetail> {
    const { v } = await versionOfMode(actor.companyID, versionId, "ocean");
    const pending = await tariffRepository.pendingOceanPorts(v.id);
    if (pending) throw APIError.failedPrecondition(`${pending} port names are not matched to a place yet: pick each one, or leave it out, first`);
    const result = await tariffRepository.approve(actor.companyID, versionId, (await userName(actor.userID)) ?? "");
    if (!result.ok) {
      if (result.reason === "not_found") throw APIError.notFound("Tariff version not found");
      throw APIError.failedPrecondition(result.reason);
    }
    return this.version(actor.companyID, versionId);
  }

  /** Throws a draft away; the file stays in storage with the soft-deleted version. */
  async discard(companyId: string, versionId: string): Promise<void> {
    await versionOfMode(companyId, versionId, "ocean");
    if (!(await tariffRepository.discard(companyId, versionId))) throw APIError.failedPrecondition("Only a draft can be discarded");
  }

  async source(companyId: string, versionId: string): Promise<TariffFile> {
    return sourceFile((await versionOfMode(companyId, versionId, "ocean")).v);
  }

  /** Changes a tariff's name and directions; its versions and rates stay as they are. */
  async update(companyId: string, tariffId: string, req: { name: string; directions: RailDirection[] }): Promise<{ id: string; name: string; directions: RailDirection[] }> {
    const name = req.name.trim();
    if (!name) throw APIError.invalidArgument("The tariff needs a name");
    const directions = chosenDirections(req.directions);
    await tariffOfMode(companyId, tariffId, "ocean");
    const row = await tariffRepository.update(companyId, tariffId, { name: name.slice(0, 200), directions });
    if (!row) throw APIError.notFound("Tariff not found");
    return { id: row.id, name: row.name, directions: row.directions };
  }

  /**
   * Every way the approved ocean tariffs valid on the day, for the direction, take the quote's
   * containers to the port of discharge - from its port of loading, or from every one when compared
   * - each with its freight and the surcharges that apply. A rate without a price for one of the
   * containers is left out; the notes say why and name the fees only charged on a manual booking.
   */
  async offers(companyId: string, req: OceanOffersQuery): Promise<OceanOffersResult> {
    if (!DIRECTIONS.includes(req.direction)) throw APIError.invalidArgument("The direction is import or export");
    if (!isRealDay(req.date)) throw APIError.invalidArgument("The date must be a day YYYY-MM-DD");
    const polCode = req.polCode.trim().toUpperCase();
    const podCode = req.podCode.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(podCode) || (!req.comparePols && !/^[A-Z]{2}[A-Z0-9]{3}$/.test(polCode))) {
      throw APIError.invalidArgument("Choose the ports of loading and discharge (UN/LOCODE places)");
    }
    if (!req.containers.length) throw APIError.invalidArgument("Add the containers in Cargo details first");
    if (req.containers.some((c) => !Number.isInteger(c.qty) || c.qty < 1 || c.qty > 999)) throw APIError.invalidArgument("A number of containers must be 1 to 999");

    const notes: string[] = [];
    const containers: OceanContainer[] = [];
    for (const c of req.containers) {
      const equipment = oceanEquipmentOf(c.type);
      if (equipment) containers.push({ type: c.type, qty: c.qty, equipment });
      else notes.push(`${c.type} is not in the shipping lines' tariffs (special equipment is priced individually)`);
    }
    if (!containers.length) return { offers: [], notes };

    const candidates = await tariffRepository.oceanCandidates(companyId, req.direction, req.date);
    const versions = new Map(candidates.map((c) => [c.version.id, c]));
    const rates = await tariffRepository.oceanRoute([...versions.keys()], podCode, req.comparePols ? null : polCode);
    const names = new Map((await linesWithRole([...new Set(candidates.map((c) => c.tariff.supplierCustomerId))])).map((l) => [l.id, l.companyName]));

    const offers: OceanOffer[] = [];
    const manual = new Set<string>();
    let unpriced = 0;
    for (const rate of rates) {
      const candidate = versions.get(rate.versionId)!;
      const supplierName = names.get(candidate.tariff.supplierCustomerId);
      if (supplierName === undefined) continue;
      const layout = layoutOf(candidate.version);
      const offer = rateOffer(rate, containers, layout.surcharges, { table: rate.tableNo, podCode, dangerous: req.dangerous });
      if (!offer.ok) {
        unpriced += 1;
        continue;
      }
      offer.manual.forEach((m) => manual.add(m));
      offers.push({
        rateId: rate.id,
        versionId: candidate.version.id,
        versionNo: candidate.version.versionNo,
        tariffId: candidate.tariff.id,
        tariffName: candidate.tariff.name,
        supplierCustomerId: candidate.tariff.supplierCustomerId,
        supplierName,
        validTo: candidate.version.validTo,
        tableLabel: layout.tables[rate.tableNo]?.label ?? "",
        polCode: rate.polCode ?? "",
        polName: rate.polName,
        podCode,
        podName: rate.podName,
        via: rate.via,
        note: rate.note,
        currency: rate.currency,
        lines: offer.lines,
        freight: offer.freight,
        surcharges: offer.surcharges,
        totals: offer.totals,
      });
    }
    offers.sort((a, b) => a.totals[0]!.amount - b.totals[0]!.amount);
    if (unpriced) notes.push(`${unpriced} ${unpriced === 1 ? "rate has" : "rates have"} no price for one of the containers and ${unpriced === 1 ? "is" : "are"} left out`);
    if (manual.size) notes.push(`Only on a booking or B/L made by hand, not added: ${[...manual].join(", ")}`);
    if (offers.length) notes.push("Origin and destination local charges are not included: see the shipping line's own tariff");
    if (!candidates.length) notes.push(`No approved ${req.direction} tariff of a shipping line is valid on ${req.date}`);
    return { offers, notes };
  }
}

export const oceanTariffService = new OceanTariffService();
