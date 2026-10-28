import type { interfaces } from "@/lib/api/client";

// Pure helpers of the "How the file was read" form of a shipping line's tariff draft: what each
// choice means, the blank parts the form adds, the lists typed as text (countries, ports, port
// codes), and the layout as it is sent.

type Layout = interfaces.OceanLayout;
type Table = interfaces.OceanTable;
type PriceColumn = interfaces.OceanPriceColumn;
type Surcharge = interfaces.OceanSurcharge;

export const BASIS_OPTIONS: { value: interfaces.OceanSurchargeBasis; label: string }[] = [
  { value: "teu", label: "per TEU" },
  { value: "container", label: "per container" },
  { value: "bl", label: "per B/L" },
  { value: "booking", label: "per booking" },
];

export const CONDITION_OPTIONS: { value: interfaces.OceanSurchargeCondition; label: string }[] = [
  { value: "always", label: "Always" },
  { value: "dangerous", label: "Dangerous goods only" },
  { value: "manual_booking", label: "Manual booking / B/L only" },
];

export const CHARGE_OPTIONS: { value: interfaces.OceanSurchargeCharge; label: string }[] = [
  { value: "fcl_baf", label: "BAF line" },
  { value: "ams_ens", label: "AMS line" },
  { value: "fcl_documentation", label: "B/L fee line" },
  { value: "other", label: "A line of its own" },
];

export const EQUIPMENT_KIND_OPTIONS: { value: "dry" | "reefer"; label: string }[] = [
  { value: "dry", label: "Dry" },
  { value: "reefer", label: "Reefer" },
];

const isLetter = (s: string | null | undefined) => !!s && /^[A-Za-z]{1,3}$/.test(s.trim());
const isLocode = (s: string) => /^[A-Z]{2}[A-Z0-9]{3}$/.test(s);

/** ["CN", "HK"] → "CN, HK" */
export const codesText = (codes: readonly string[]) => codes.join(", ");

/** "cn, hk; tw" → ["CN", "HK", "TW"]: 2-letter country codes, each once; anything else left out. */
export function parseCountries(text: string): string[] {
  const codes = text.split(/[\s,;]+/).map((s) => s.trim().toUpperCase());
  return [...new Set(codes.filter((c) => /^[A-Z]{2}$/.test(c)))];
}

/** "ngapp, nglos" → ["NGAPP", "NGLOS"]: UN/LOCODEs, each once; anything else left out. */
export function parsePorts(text: string): string[] {
  const codes = text.split(/[\s,;]+/).map((s) => s.trim().toUpperCase());
  return [...new Set(codes.filter(isLocode))];
}

/** {"HAM": "DEHAM"} → "HAM = DEHAM", one per line. */
export const portCodesText = (codes: Record<string, string>) =>
  Object.entries(codes)
    .map(([written, code]) => `${written} = ${code}`)
    .join("\n");

/** "HAM = DEHAM" lines → {"HAM": "DEHAM"}; a line without a name and a UN/LOCODE is left out. */
export function parsePortCodes(text: string): Record<string, string> {
  const codes: Record<string, string> = {};
  for (const line of text.split(/\n/)) {
    const at = line.lastIndexOf("=");
    if (at < 0) continue;
    const written = line.slice(0, at).trim();
    const code = line.slice(at + 1).trim().toUpperCase();
    if (written && isLocode(code)) codes[written] = code;
  }
  return codes;
}

/** A new rate table below the last one on its sheet; its price columns are added one by one. */
export function newTable(layout: Layout, firstSheet: string): Table {
  const last = layout.tables.at(-1);
  return {
    label: "",
    sheet: last?.sheet ?? firstSheet,
    headerRow: (last?.lastDataRow ?? last?.firstDataRow ?? 0) + 2,
    firstDataRow: (last?.lastDataRow ?? last?.firstDataRow ?? 0) + 3,
    lastDataRow: null,
    pol: last?.pol ?? null,
    polFixed: last?.pol ? null : (last?.polFixed ?? ""),
    pod: last?.pod ?? "",
    via: null,
    currency: null,
    currencyFixed: last?.currencyFixed ?? "USD",
    prices: [],
    note: null,
    podCountries: [],
  };
}

/**
 * The layout without one rate table. The surcharges keep naming the same tables; one that was only
 * for that table goes with it (with no table left it would be for every table).
 */
export function withoutTable(layout: Layout, index: number): Layout {
  return {
    ...layout,
    tables: layout.tables.filter((_, i) => i !== index),
    surcharges: layout.surcharges
      .filter((s) => !(s.tables.length && s.tables.every((i) => i === index)))
      .map((s) => ({ ...s, tables: s.tables.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)) })),
  };
}

/** A new price column for a container the table has no column for yet. */
export function newPriceColumn(table: Table): PriceColumn {
  const used = new Set(table.prices.map((p) => p.equipment));
  const equipment = (["20DC", "40DC", "40HC", "20RF", "40RF"] as const).find((e) => !used.has(e)) ?? "20DC";
  return { column: "", equipment, label: "" };
}

export const newSurcharge = (): Surcharge => ({
  name: "",
  code: "",
  amount: 0,
  currency: "USD",
  basis: "teu",
  equipment: [],
  tables: [],
  countries: [],
  exceptCountries: [],
  ports: [],
  exceptPorts: [],
  condition: "always",
  charge: "other",
});

const upper = (s: string) => s.trim().toUpperCase();
const upperOrNull = (s: string | null) => (s && s.trim() ? upper(s) : null);

/**
 * The layout as sent: text trimmed, letters and codes upper case, a table's ports of loading as a
 * column or as text (not both), its currency as a column or a code, empty terms and links dropped,
 * and a surcharge's tables only those the layout has.
 */
export function cleanOceanLayout(layout: Layout): Layout {
  return {
    ...layout,
    name: layout.name.trim(),
    tables: layout.tables.map((t) => {
      const pol = upperOrNull(t.pol);
      const currency = upperOrNull(t.currency);
      return {
        ...t,
        label: t.label.trim(),
        pol,
        polFixed: pol ? null : (t.polFixed ?? "").trim() || null,
        pod: upper(t.pod),
        via: upperOrNull(t.via),
        currency,
        currencyFixed: currency ? null : upperOrNull(t.currencyFixed),
        note: upperOrNull(t.note),
        prices: t.prices.map((p) => ({ column: upper(p.column), equipment: p.equipment, label: p.label.trim() || p.equipment })),
        podCountries: parseCountries(t.podCountries.join(",")),
      };
    }),
    surcharges: layout.surcharges.map((s) => ({
      ...s,
      name: s.name.trim(),
      code: upper(s.code),
      currency: upper(s.currency),
      tables: s.tables.filter((i) => i < layout.tables.length),
    })),
    conditions: layout.conditions.map((c) => c.trim()).filter(Boolean),
    links: layout.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label || l.url),
  };
}

/** What keeps the form from being sent, in words; empty when it can be. The server checks the rest. */
export function oceanLayoutProblems(layout: Layout): string[] {
  const problems: string[] = [];
  const add = (p: string) => !problems.includes(p) && problems.push(p);
  if (!layout.name.trim()) add("The layout needs a name");
  if (layout.validFrom && layout.validTo && layout.validTo < layout.validFrom) add("The validity ends before it starts");
  if (!layout.tables.length) add("Add at least one rate table");

  for (const t of layout.tables) {
    const name = t.label.trim() || "A rate table";
    if (!t.label.trim()) add("Every rate table needs a name");
    if (!t.sheet) add(`${name}: choose its sheet`);
    if (!(t.firstDataRow > t.headerRow)) add(`${name}: the first rate row must come after the headings row`);
    if (t.lastDataRow !== null && t.lastDataRow < t.firstDataRow) add(`${name}: the last rate row comes before the first`);
    if (!isLetter(t.pol) && !(t.polFixed ?? "").trim()) add(`${name}: choose the column of the ports of loading, or type them`);
    if (!isLetter(t.pod)) add(`${name}: choose the column of the ports of discharge`);
    if (!isLetter(t.currency) && !/^[A-Za-z]{3}$/.test((t.currencyFixed ?? "").trim())) add(`${name}: choose the currency column, or type the currency (e.g. USD)`);
    if (!t.prices.length) add(`${name}: add at least one price column`);
    if (t.prices.some((p) => !isLetter(p.column))) add(`${name}: every price column needs its column`);
    if (new Set(t.prices.map((p) => p.column.trim().toUpperCase())).size !== t.prices.length) add(`${name}: a column is used for two prices`);
    if (new Set(t.prices.map((p) => p.equipment)).size !== t.prices.length) add(`${name}: two price columns are for the same container`);
  }

  for (const s of layout.surcharges) {
    const name = s.code.trim() || s.name.trim() || "A surcharge";
    if (!s.name.trim() || !s.code.trim()) add("Every surcharge needs a name and a code");
    if (!(s.amount >= 0)) add(`${name}: the amount must be 0 or more`);
    if (!/^[A-Za-z]{3}$/.test(s.currency.trim())) add(`${name}: the currency is a 3-letter code, e.g. USD`);
  }
  return problems;
}
