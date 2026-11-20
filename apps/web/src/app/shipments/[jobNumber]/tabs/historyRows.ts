import type { interfaces } from "@/lib/api/client";
import { COLUMNS } from "@/lib/columnConfig";
import { businessDateTime, formatDate } from "@/lib/date";

// The History tab's rows (Council Outlay 11, step 6): a job's shipment_audit entries as a manager
// reads them - which field, what it was and what it became, who changed it and when, on Prague's
// clock. Pure, so it is unit-tested.

type Entry = interfaces.ShipmentHistoryEntry;

// A job field's name as the lists show it, by the key the history keeps (the API field): a column's
// title under its API field and its own key; a date's time under its time field.
const FIELD_TITLES: ReadonlyMap<string, string> = (() => {
  const titles = new Map<string, string>();
  for (const col of COLUMNS) {
    if (col.timeField) titles.set(col.timeField, `${col.title} (time)`);
    if (col.apiField) titles.set(col.apiField, col.title);
    titles.set(col.key, col.title);
  }
  return titles;
})();

// The job's lists of detail rows, which the history keeps under the list's key (the API's
// lib/detailRowsAudit) and no column names (User Council x5: "cargoItems", "containers").
const LIST_TITLES: Readonly<Record<string, string>> = {
  containers: "Containers",
  cargoItems: "Cargo lines",
  cargoDimensions: "Cargo dimensions",
  commercialInvoices: "Commercial invoices",
};

/** A key nothing names, in words: "pickupSiteNote" → "Pickup site note"; a key of another form as it is. */
const keyInWords = (field: string): string =>
  /^[a-z][a-zA-Z0-9]*$/.test(field)
    ? field
        .replace(/([A-Z])/g, (c) => ` ${c.toLowerCase()}`)
        .replace(/^./, (c) => c.toUpperCase())
    : field;

/** What changed, in words: the server's own label (a claim, a hand-over…), else the column's or list's title, else the key in words. */
export const historyLabel = (entry: Pick<Entry, "field" | "label">): string =>
  entry.label?.trim() || FIELD_TITLES.get(entry.field) || LIST_TITLES[entry.field] || keyInWords(entry.field);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An entry that only says a record's id changed ("customerId — → 5519…"): the job's link to a Customer
 * Database company, contact or site, whose name has an entry of its own in the same save. Left out (x5).
 */
export const idOnly = (entry: Pick<Entry, "field" | "oldValue" | "newValue">): boolean =>
  /Id$/.test(entry.field) && [entry.oldValue, entry.newValue].every((v) => !(v ?? "").trim() || UUID.test((v ?? "").trim()));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

type Item = Record<string, unknown>;

/**
 * A figure with more decimals than anyone types - a weight a piece worked out by dividing, 745.454545455 -
 * to three at most, trailing zeros dropped (745.455); any other value as it is (x5).
 */
const DECIMALS = /^-?\d+\.\d{4,}$/;
export const figure = (v: string): string => (DECIMALS.test(v) ? String(Number(Number(v).toFixed(3))) : v);

/**
 * The weights and volumes the app works out (a weight a piece divided from a line's total, the job's
 * totals from its lines): only these are rounded. An HS code "8708.9997", a 4-decimal rate or any
 * typed text reads as it was saved (mock council S7-2).
 */
const FIGURE_FIELDS: ReadonlySet<string> = new Set([
  "weightPerPcKg",
  "weightPerPkg",
  "volumePerPcM3",
  "volumePerPkg",
  "grossWeight",
  "volume",
  "weightKg",
  "volumeCbm",
  "totalWeightTons",
  "totalVolumeCbm",
]);

const text = (v: unknown): string => (v === null || v === undefined || typeof v === "object" ? "" : String(v).trim());
/** A computed weight or volume of a line, rounded as figure() does. */
const num = (v: unknown): string => figure(text(v));
const join = (parts: readonly string[]): string => parts.filter(Boolean).join(", ");

/** A Cargo Details dimension line: "1 × 120×80×100 cm, 300 kg/pc, Pallets, ADR UN1203 cl. 3". */
function dimensionLine(d: Item): string {
  const sizes = [d.lengthCm, d.widthCm, d.heightCm].map(text);
  const size = sizes.some(Boolean) ? `${sizes.map((s) => s || "?").join("×")} ${text(d.dimensionUnit) || "cm"}` : "";
  const pieces = text(d.pieces);
  const weight = num(d.weightPerPcKg) || num(d.weightPerPkg);
  const volume = num(d.volumePerPcM3) || num(d.volumePerPkg);
  const adr = text(d.adrUn) ? `ADR UN${text(d.adrUn)}${text(d.adrClass) ? ` cl. ${text(d.adrClass)}` : ""}` : "";
  return join([
    size ? [pieces && `${pieces} ×`, size].filter(Boolean).join(" ") : pieces && `${pieces} pcs`,
    weight && `${weight} kg/pc`,
    volume && `${volume} m³/pc`,
    text(d.packageType),
    d.stackable === "no" || d.stackable === false ? "not stackable" : "",
    adr,
  ]);
}

/** A container: "GCXU2218720 20' DC, seal LKAB74987, Cartons, 7.74 m³". */
const containerLine = (c: Item): string =>
  join([
    [text(c.containerNumber), text(c.type)].filter(Boolean).join(" "),
    text(c.sealNumber) && `seal ${text(c.sealNumber)}`,
    [text(c.packages), text(c.packageType)].filter(Boolean).join(" "),
    num(c.grossWeight) && `${num(c.grossWeight)} kg`,
    num(c.volume) && `${num(c.volume)} m³`,
  ]);

/** A cargo line: "10 Pallet(s) AUTOMOTIVE PARTS, HS 870899, 1442 kg, value 5000 EUR". */
const cargoLine = (c: Item): string =>
  join([
    [text(c.pieces), text(c.packageType), text(c.cargoDescription)].filter(Boolean).join(" "),
    text(c.hsCode) && `HS ${text(c.hsCode)}`,
    num(c.grossWeight) && `${num(c.grossWeight)} kg`,
    text(c.commercialInvoiceValue) && `value ${[text(c.commercialInvoiceValue), text(c.currency)].filter(Boolean).join(" ")}`,
  ]);

/** A measured total (remeasurement): "1 colli, 500 kg, 6.292 m³". */
const totalsLine = (t: Item): string =>
  join([
    text(t.colli) && `${text(t.colli)} colli`,
    num(t.weightKg) && `${num(t.weightKg)} kg`,
    num(t.volumeCbm) && `${num(t.volumeCbm)} m³`,
  ]);

/** Anything else kept as a record: its filled plain values, ids left out. */
const otherLine = (o: Item): string =>
  join(
    Object.entries(o)
      .filter(([k]) => !/(^id|Id)$/.test(k))
      .map(([k, v]) => {
        const shown = FIGURE_FIELDS.has(k) ? num(v) : text(v);
        return shown ? `${k}: ${shown}` : "";
      }),
  );

function itemLine(o: Item): string {
  if ("lengthCm" in o || "weightPerPcKg" in o) return dimensionLine(o);
  if ("containerNumber" in o || "teu" in o) return containerLine(o);
  if ("cargoDescription" in o || "hsCode" in o) return cargoLine(o);
  if ("colli" in o || "weightKg" in o || "volumeCbm" in o) return totalsLine(o);
  return otherLine(o);
}

const isItem = (v: unknown): v is Item => typeof v === "object" && v !== null && !Array.isArray(v);

/** A list or record the history kept as JSON, a line per row; null when it is not one (or was cut and no longer reads). */
function recordValue(v: string): string | null {
  if (!/^[[{]/.test(v)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return "none";
    const lines = parsed.map((row) => (isItem(row) ? itemLine(row) : text(row)) || "an empty line");
    return lines.length > 1 ? lines.map((l, i) => `${i + 1}. ${l}`).join("\n") : (lines[0] ?? "none");
  }
  return isItem(parsed) ? itemLine(parsed) || "none" : null;
}

/**
 * A value as the row shows it: a day as DD.MM.YYYY, a moment on Prague's clock, a list (cargo lines,
 * containers…) a line per row, a computed weight or volume of `field` rounded, anything else as stored;
 * "" for none.
 */
export function historyValue(value: string | null | undefined, field?: string): string {
  const v = (value ?? "").trim();
  if (DAY.test(v)) return formatDate(v);
  if (MOMENT.test(v)) return businessDateTime(v) || v;
  return recordValue(v) ?? (field && FIGURE_FIELDS.has(field) && DECIMALS.test(v) ? figure(v) : (value ?? ""));
}

/** Who made the change: their name with their e-mail beside it; the user id when the names could not be read. */
export function historyWho(entry: Pick<Entry, "userId" | "userName" | "userEmail">, namesKnown: boolean): { who: string; hint: string } {
  const name = entry.userName.trim();
  const email = entry.userEmail.trim();
  if (name || email) return { who: name || email, hint: name && email ? email : "" };
  if (!namesKnown) return { who: entry.userId, hint: "The names could not be read just now" };
  return { who: "A user no longer known", hint: entry.userId };
}

export interface HistoryRow {
  id: string;
  label: string;
  from: string;
  to: string;
  /** A value was cut at 2,000 characters. */
  cut: boolean;
  who: string;
  whoHint: string;
  /** "05.03.2026 14:05", Prague time. */
  when: string;
}

/**
 * Saves of one field by one person this close together are one change: the job page saves a field as
 * it is typed, so one dimensions line typed box by box made a row per box (User Council x5, E16).
 */
export const ONE_EDIT_MS = 5 * 60 * 1000;

// What is typed box by box, whose saves merge: a free-text or number column, and the job's lists of
// detail rows. A dropdown, a status, a date, a person or a money field keeps a row per save, so a job
// set to Cancelled and back within minutes says so (mock council S7-3).
const MONEY_FIELDS: ReadonlySet<string> = new Set(["commercialInvoiceValue", "buying", "selling"]);
const TYPED_FIELDS: ReadonlySet<string> = (() => {
  const typed = new Set<string>(Object.keys(LIST_TITLES));
  for (const col of COLUMNS) {
    if (col.type !== "text" || MONEY_FIELDS.has(col.key)) continue;
    typed.add(col.key);
    if (col.apiField) typed.add(col.apiField);
  }
  return typed;
})();

/** Whether saves of this field, close together, are one change: a typed field's (TYPED_FIELDS). */
export const mergesSaves = (field: string): boolean => TYPED_FIELDS.has(field);

/**
 * The rows of the pages read so far, newest first, each page's entries with what it says of the names.
 * An id-only entry is left out; a run of saves of the same field by the same person, each within
 * ONE_EDIT_MS of the next, is one row: what it was before the first, what it became after the last.
 */
export function historyRows(pages: readonly Pick<interfaces.ShipmentHistoryPage, "entries" | "namesKnown">[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let newer: { entry: Entry; row: HistoryRow } | null = null;
  for (const page of pages) {
    for (const e of page.entries) {
      if (idOnly(e)) continue;
      // Newest first, so `e` is the older one: the same field by the same person just before the row above joins it.
      // Only typed fields merge: an entry the server labels is an event of its own (a claim, a struck tracking
      // event, a task tick, a nudge…) and keeps its row.
      if (
        newer &&
        mergesSaves(e.field) &&
        !e.label?.trim() &&
        !newer.entry.label?.trim() &&
        newer.entry.field === e.field &&
        newer.entry.userId === e.userId &&
        Date.parse(newer.entry.changedAt) - Date.parse(e.changedAt) <= ONE_EDIT_MS
      ) {
        newer.row.from = historyValue(e.oldValue, e.field);
        newer.row.cut = newer.row.cut || e.cut;
        newer = { entry: e, row: newer.row };
        continue;
      }
      const { who, hint } = historyWho(e, page.namesKnown);
      const row: HistoryRow = {
        id: e.id,
        label: historyLabel(e),
        from: historyValue(e.oldValue, e.field),
        to: historyValue(e.newValue, e.field),
        cut: e.cut,
        who,
        whoHint: hint,
        when: businessDateTime(e.changedAt),
      };
      rows.push(row);
      newer = { entry: e, row };
    }
  }
  return rows;
}
