import { APIError } from "encore.dev/api";
import { auth } from "~encore/clients";
import { isRealYmd } from "../../../lib/businessDate";
import type { Actor } from "../../../lib/rbac";
import type {
  OceanData,
  OceanLayout,
  OceanOffer,
  OceanOfferContainer,
  OceanPlace,
  OceanPort,
  RailDirection,
  SheetPreview,
  SupplierTariffVersion,
  TariffFile,
  TariffFinding,
} from "../interfaces/interfaces";
import { findingTotals } from "../lib/railConvert";
import { convertOcean, type PortNeed } from "../lib/oceanConvert";
import { oceanLayoutProblem, parseOceanLayout } from "../lib/oceanLayout";
import { countriesFor, nameVariants, placeFor, portCodeFor } from "../lib/oceanPorts";
import { oceanEquipmentOf, rateOffer, type OceanContainer } from "../lib/oceanPricing";
import { RAIL_DIRECTIONS, chosenDirections } from "../lib/tariffPorts";
import { sheetPreview, type Sheet } from "../lib/sheet";
import { tariffRepository } from "../repositories/tariff.repository";
import type { OceanPortRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { readOceanLayout } from "./oceanLayoutReader.service";
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

// Shipping lines' tariffs (Tariffs → Shipping Lines): a manager uploads the line's own Excel rate
// document, the AI reads where each rate table and surcharge rule is, the code reads every rate and
// matches the port names to the UN/LOCODE place list, a manager picks the ports it could not match
// and approves. Approved versions price a Sea FCL quote's ocean freight (Sales → Pricing).

const PREVIEW_ROWS = 40;

// Why a port is not picked on a version that is no draft (any more).
const PORTS_OF_DRAFT_ONLY = "Only a draft's ports can be changed";

// The most candidates kept for a port name a user has to pick.
const MAX_CANDIDATES = 8;
// The most place-list lookups asked of the auth service at once: a rate document names a few
// hundred ports, each in up to three ways of writing.
const LOOKUP_BATCH = 200;
// The most container lines priced at once, as for rail.
const MAX_CONTAINER_LINES = 20;

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

export interface OceanTariffFields {
  id: string;
  name: string;
  directions: RailDirection[];
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
  containers: OceanOfferContainer[];
  /** The cargo is dangerous goods: IMO surcharges apply */
  dangerous: boolean;
}

export interface OceanOffersResult {
  /** Every way a shipping line takes the containers from port to port; the caller ranks them in its own currency */
  offers: OceanOffer[];
  /** What is not priced and why, the fees only charged on a manual booking, what is not included */
  notes: string[];
}

const layoutOf = (v: TariffVersionRecord) => v.layout as OceanLayout;
const portKey = (side: string, name: string) => `${side}|${name}`;

const portOf = (p: OceanPortRecord): OceanPort => ({ side: p.side, name: p.name, countryHint: p.countryHint, code: p.code, status: p.status, candidates: p.candidates });

/** The places of the codes, and the candidates of each name, asked of the place list a batch at a time. */
async function placeLookup(codes: string[], names: { name: string; countryCode?: string }[]): Promise<{ byCode: OceanPlace[]; candidates: OceanPlace[][] }> {
  const byCode: OceanPlace[] = [];
  const candidates: OceanPlace[][] = [];
  for (let i = 0; i < Math.max(codes.length, names.length); i += LOOKUP_BATCH) {
    const answer = await auth.placeLookup({ codes: codes.slice(i, i + LOOKUP_BATCH), names: names.slice(i, i + LOOKUP_BATCH) });
    byCode.push(...answer.byCode);
    candidates.push(...answer.candidates);
  }
  return { byCode, candidates };
}

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
  const { byCode, candidates } = await placeLookup([...byCodeAsked], lookups.flatMap((l) => l.queries));
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

// The finding of the port names still to match: approval waits for them.
const portsPending = (pending: number): TariffFinding => ({
  level: "warning",
  code: "ports_pending",
  message: `${pending} port names are not matched to a place yet: pick each one (or leave it out) before approving`,
  count: pending,
  rows: [],
});

// What a layout reads from the file, with its ports matched, and what a draft is saved with besides it.
async function convertDraft(sheets: Sheet[], layout: OceanLayout, picks: Map<string, { code: string | null; status: OceanPort["status"] }>): Promise<{ data: OceanData; fields: ReadFields }> {
  const problem = oceanLayoutProblem(layout, sheets);
  const read = problem ? { rates: [], ports: [], findings: [unusableLayout(problem)] } : convertOcean(sheets, layout);
  const ports = await matchPorts(read.ports, layout, picks);
  const pending = ports.filter((p) => p.status === "pending").length;
  const findings = pending ? [...read.findings, portsPending(pending)] : read.findings;
  // A version's currency as listed: its rates' currencies together.
  const currency = [...new Set(read.rates.map((r) => r.currency))].join("/") || "USD";
  const preview: SheetPreview[] = sheets.map((s) => sheetPreview(s, PREVIEW_ROWS));
  return { data: { rates: read.rates, ports }, fields: readFields({ layout, currency, findings, rowCount: read.rates.length }, preview) };
}

const lineOf = (s: SupplierTariffs, day: string): ShippingLineItem => ({
  ...supplierGlance(s, day),
  directions: RAIL_DIRECTIONS.filter((d) => s.tariffs.some((t) => t.directions.includes(d))),
});

// The picks of a tariff's versions, newest first, as the next reading takes them over.
async function picksOf(companyId: string, tariffId: string | null) {
  const picks = new Map<string, { code: string | null; status: OceanPort["status"] }>();
  if (!tariffId) return picks;
  for (const p of await tariffRepository.oceanPicks(companyId, tariffId)) {
    const key = portKey(p.side, p.name);
    if (!picks.has(key)) picks.set(key, { code: p.code, status: p.status });
  }
  return picks;
}

class OceanTariffService {
  /** The shipping lines with their tariffs at a glance, by company name. */
  async lines(companyId: string): Promise<ShippingLineItem[]> {
    const today = businessToday();
    return (await supplierTariffs(companyId, "ocean")).map((s) => lineOf(s, today));
  }

  /** One shipping line with all its tariffs and their versions. */
  async line(companyId: string, customerId: string): Promise<ShippingLineDetail> {
    const [found] = await supplierTariffs(companyId, "ocean", [customerId]);
    if (!found) throw APIError.notFound("This company is not a shipping line in the Customer Database");
    return {
      line: lineOf(found, businessToday()),
      tariffs: found.tariffs.map((t) => ({
        id: t.id,
        name: t.name,
        supplierCustomerId: t.supplierCustomerId,
        directions: t.directions,
        versions: found.versions.filter((v) => v.tariffId === t.id).map(summaryOf),
      })),
    };
  }

  /** Reads an uploaded rate document into a new draft: the AI reads where each part is, the code every rate and port. */
  async upload(actor: Actor, req: OceanUpload): Promise<OceanTariffVersionDetail> {
    const file = uploadedFile(req);
    const { supplier, tariff } = await uploadTarget(actor.companyID, "ocean", req.supplierCustomerId, req.tariffId);
    // Checked before the AI is asked: a new tariff cannot be saved without them.
    const directions = tariff ? null : chosenDirections(req.directions);

    const sheets = await sheetsOf(file.bytes, file.fileName, { hidden: true });
    const previous = (tariff?.layout ?? null) as OceanLayout | null;
    const layout = await readOceanLayout(sheets, previous);
    const { data, fields } = await convertDraft(sheets, layout, await picksOf(actor.companyID, tariff?.id ?? null));
    const versionId = await saveDraft(
      actor,
      file,
      tariff ? { tariffId: tariff.id } : { supplierCustomerId: supplier.id, mode: "ocean", name: layout.name, ports: [], directions: directions! },
      { ...fields, layoutSource: previous ? "remembered" : "ai" },
      data,
    );
    return this.version(actor.companyID, versionId);
  }

  /** A version with its layout, findings, the first rows of the file, and its port names. */
  async version(companyId: string, versionId: string): Promise<OceanTariffVersionDetail> {
    const { v, t } = await versionOfMode(companyId, versionId, "ocean");
    const [[supplier], ports] = await Promise.all([suppliersOf("ocean", [t.supplierCustomerId]), tariffRepository.oceanPorts(companyId, v.id)]);
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
    const { rows, total } = await tariffRepository.oceanRates(companyId, v.id, filter);
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
        prices: Object.fromEntries(Object.entries(r.prices).filter((e): e is [string, number] => e[1] !== undefined)),
        note: r.note,
      })),
      total,
    };
  }

  /** Reads a draft's file again with a corrected layout; its rates, ports and findings are replaced, the ports a user picked kept. */
  async relayout(companyId: string, versionId: string, input: OceanLayout): Promise<OceanTariffVersionDetail> {
    const layout = parseOceanLayout(input);
    const { v, t } = await versionOfMode(companyId, versionId, "ocean");
    const { data, fields } = await convertDraft(await draftSheets(v, { hidden: true }), layout, await picksOf(companyId, t.id));
    await replaceDraft(companyId, versionId, fields, data);
    return this.version(companyId, versionId);
  }

  /**
   * Sets what a port name of a draft means: a place a user picked (it must be in the place list),
   * or none, which leaves its rates out. The tariff's next versions take the pick over.
   */
  async setPort(companyId: string, versionId: string, req: { side: "pol" | "pod"; name: string; code: string | null }): Promise<OceanTariffVersionDetail> {
    const { v } = await versionOfMode(companyId, versionId, "ocean");
    if (v.status !== "draft") throw APIError.failedPrecondition(PORTS_OF_DRAFT_ONLY);
    const code = req.code?.trim().toUpperCase() || null;
    if (code) {
      if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(code)) throw APIError.invalidArgument(`${code} is not a UN/LOCODE, e.g. DEHAM`);
      const { byCode } = await auth.placeLookup({ codes: [code], names: [] });
      if (!byCode.length) throw APIError.invalidArgument(`${code} is not a place of the UN/LOCODE list`);
    }
    const picked = await tariffRepository.setOceanPort(companyId, v.id, req.side, req.name, code);
    if (!picked.ok) {
      // A version approved or thrown away since it was read above.
      if (picked.reason === "not_draft") throw APIError.failedPrecondition(PORTS_OF_DRAFT_ONLY);
      throw APIError.notFound("This version has no such port name");
    }
    // The "ports pending" finding follows what is left to pick.
    const pending = await tariffRepository.pendingOceanPorts(companyId, v.id);
    const others = v.findings.filter((f) => f.code !== "ports_pending");
    const findings = pending ? [...others, portsPending(pending)] : others;
    const totals = findingTotals(findings);
    await tariffRepository.replaceFindings(companyId, v.id, findings, totals);
    return this.version(companyId, versionId);
  }

  /** Approves a draft without errors and with every port matched: it prices from its start date, earlier versions give way. */
  async approve(actor: Actor, versionId: string): Promise<OceanTariffVersionDetail> {
    const { v } = await versionOfMode(actor.companyID, versionId, "ocean");
    const pending = await tariffRepository.pendingOceanPorts(actor.companyID, v.id);
    if (pending) throw APIError.failedPrecondition(`${pending} port names are not matched to a place yet: pick each one, or leave it out, first`);
    await approveVersion(actor, versionId);
    return this.version(actor.companyID, versionId);
  }

  /** Throws a draft away; the file stays in storage with the soft-deleted version. */
  async discard(companyId: string, versionId: string): Promise<void> {
    await discardVersion(companyId, versionId, "ocean");
  }

  /** The file a version was read from. */
  async source(companyId: string, versionId: string): Promise<TariffFile> {
    return sourceFile(companyId, versionId, "ocean");
  }

  /** Changes a tariff's name and directions; its versions and rates stay as they are. */
  async update(companyId: string, tariffId: string, req: { name: string; directions: RailDirection[] }): Promise<OceanTariffFields> {
    const name = tariffName(req.name);
    const directions = chosenDirections(req.directions);
    const row = await updateTariff(companyId, tariffId, "ocean", { name, directions });
    return { id: row.id, name: row.name, directions: row.directions };
  }

  /**
   * Every way the approved ocean tariffs valid on the day, for the direction, take the quote's
   * containers to the port of discharge - from its port of loading, or from every one when compared
   * - each with its freight and the surcharges that apply. A rate without a price for one of the
   * containers is left out; the notes say why and name the fees only charged on a manual booking.
   */
  async offers(companyId: string, req: OceanOffersQuery): Promise<OceanOffersResult> {
    if (!RAIL_DIRECTIONS.includes(req.direction)) throw APIError.invalidArgument("The direction is import or export");
    if (!isRealYmd(req.date)) throw APIError.invalidArgument("The date must be a day YYYY-MM-DD");
    const polCode = req.polCode.trim().toUpperCase();
    const podCode = req.podCode.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(podCode) || (!req.comparePols && !/^[A-Z]{2}[A-Z0-9]{3}$/.test(polCode))) {
      throw APIError.invalidArgument("Choose the ports of loading and discharge (UN/LOCODE places)");
    }
    if (!req.containers.length) throw APIError.invalidArgument("Add the containers in Cargo details first");
    if (req.containers.length > MAX_CONTAINER_LINES) throw APIError.invalidArgument(`At most ${MAX_CONTAINER_LINES} container lines are priced at once`);
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
    const rates = await tariffRepository.oceanRoute(companyId, [...versions.keys()], podCode, req.comparePols ? null : polCode);
    const names = new Map((await suppliersOf("ocean", [...new Set(candidates.map((c) => c.tariff.supplierCustomerId))])).map((l) => [l.id, l.companyName]));

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
