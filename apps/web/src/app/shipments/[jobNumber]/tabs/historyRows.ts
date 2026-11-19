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

/** What changed, in words: the server's own label (a claim, a hand-over…), else the column's title, else the key. */
export const historyLabel = (entry: Pick<Entry, "field" | "label">): string => entry.label?.trim() || FIELD_TITLES.get(entry.field) || entry.field;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

type Item = Record<string, unknown>;

const text = (v: unknown): string => (v === null || v === undefined || typeof v === "object" ? "" : String(v).trim());
const join = (parts: readonly string[]): string => parts.filter(Boolean).join(", ");

/** A Cargo Details dimension line: "1 × 120×80×100 cm, 300 kg/pc, Pallets, ADR UN1203 cl. 3". */
function dimensionLine(d: Item): string {
  const sizes = [d.lengthCm, d.widthCm, d.heightCm].map(text);
  const size = sizes.some(Boolean) ? `${sizes.map((s) => s || "?").join("×")} ${text(d.dimensionUnit) || "cm"}` : "";
  const pieces = text(d.pieces);
  const weight = text(d.weightPerPcKg) || text(d.weightPerPkg);
  const volume = text(d.volumePerPcM3) || text(d.volumePerPkg);
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
    text(c.grossWeight) && `${text(c.grossWeight)} kg`,
    text(c.volume) && `${text(c.volume)} m³`,
  ]);

/** A cargo line: "10 Pallet(s) AUTOMOTIVE PARTS, HS 870899, 1442 kg, value 5000 EUR". */
const cargoLine = (c: Item): string =>
  join([
    [text(c.pieces), text(c.packageType), text(c.cargoDescription)].filter(Boolean).join(" "),
    text(c.hsCode) && `HS ${text(c.hsCode)}`,
    text(c.grossWeight) && `${text(c.grossWeight)} kg`,
    text(c.commercialInvoiceValue) && `value ${[text(c.commercialInvoiceValue), text(c.currency)].filter(Boolean).join(" ")}`,
  ]);

/** A measured total (remeasurement): "1 colli, 500 kg, 6.292 m³". */
const totalsLine = (t: Item): string =>
  join([
    text(t.colli) && `${text(t.colli)} colli`,
    text(t.weightKg) && `${text(t.weightKg)} kg`,
    text(t.volumeCbm) && `${text(t.volumeCbm)} m³`,
  ]);

/** Anything else kept as a record: its filled plain values, ids left out. */
const otherLine = (o: Item): string =>
  join(
    Object.entries(o)
      .filter(([k]) => !/(^id|Id)$/.test(k))
      .map(([k, v]) => (text(v) ? `${k}: ${text(v)}` : "")),
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

/** A value as the row shows it: a day as DD.MM.YYYY, a moment on Prague's clock, a list (cargo lines, containers…) a line per row, anything else as stored; "" for none. */
export function historyValue(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (DAY.test(v)) return formatDate(v);
  if (MOMENT.test(v)) return businessDateTime(v) || v;
  return recordValue(v) ?? value ?? "";
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

/** The rows of the pages read so far, newest first, each page's entries with what it says of the names. */
export function historyRows(pages: readonly Pick<interfaces.ShipmentHistoryPage, "entries" | "namesKnown">[]): HistoryRow[] {
  return pages.flatMap((page) =>
    page.entries.map((e) => {
      const { who, hint } = historyWho(e, page.namesKnown);
      return {
        id: e.id,
        label: historyLabel(e),
        from: historyValue(e.oldValue),
        to: historyValue(e.newValue),
        cut: e.cut,
        who,
        whoHint: hint,
        when: businessDateTime(e.changedAt),
      };
    }),
  );
}
