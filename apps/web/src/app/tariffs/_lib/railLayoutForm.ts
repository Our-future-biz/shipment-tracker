import type { interfaces } from "@/lib/api/client";

// Pure helpers of the "How the file was read" form of a rail tariff draft: the columns a sheet has,
// named after their headings, what each field of the layout means, and the layout as it is sent.

type Layout = interfaces.RailLayout;
type ColumnField = keyof interfaces.RailLayoutColumns;

/** The fields of the column mapping, in the order the form shows them. */
export const COLUMN_FIELDS: readonly { key: ColumnField; label: string }[] = [
  { key: "country", label: "Country" },
  { key: "postcode", label: "Postcode" },
  { key: "place", label: "Place" },
  { key: "region", label: "Region" },
  { key: "via", label: "Via terminal" },
  { key: "emptyDepot", label: "Empty depot" },
  { key: "note", label: "Note" },
  { key: "validFrom", label: "Valid from" },
  { key: "validTo", label: "Valid to" },
];

/** A column letter's position: "A" → 1, "AA" → 27. */
export function letterIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** The preview of the named sheet, if the file had it. */
export const previewSheet = (preview: readonly interfaces.SheetPreview[], sheet: string) => preview.find((p) => p.name === sheet) ?? null;

/** The heading of each column of the sheet: the text in its headings row, "" when there is none. */
export function columnHeadings(preview: interfaces.SheetPreview | null, headerRow: number): Map<string, string> {
  const headings = new Map<string, string>();
  if (!preview) return headings;
  for (const row of preview.rows) {
    for (const letter of Object.keys(row.cells)) if (!headings.has(letter)) headings.set(letter, "");
  }
  const header = preview.rows.find((r) => r.rowNo === headerRow);
  for (const [letter, text] of Object.entries(header?.cells ?? {})) headings.set(letter, text);
  return new Map([...headings].sort(([a], [b]) => letterIndex(a) - letterIndex(b)));
}

/** "D — Via/Depot", or "D" when the column has no heading. */
export const columnLabel = (letter: string, heading: string | undefined) => (heading ? `${letter} — ${heading}` : letter);

/** The columns to choose from: every column of the preview, plus any the layout names that the preview lacks. */
export function columnOptions(headings: Map<string, string>, layout: Layout): { value: string; label: string }[] {
  const named = [...Object.values(layout.columns), ...layout.bands.map((b) => b.column)].filter((l): l is string => !!l);
  const letters = [...new Set([...headings.keys(), ...named])].sort((a, b) => letterIndex(a) - letterIndex(b));
  return letters.map((letter) => ({ value: letter, label: columnLabel(letter, headings.get(letter)) }));
}

/** A new price column: the first column right of the last band, with the preview's heading as label. */
export function newBand(layout: Layout, headings: Map<string, string>): interfaces.RailBand {
  const last = layout.bands.reduce((max, b) => Math.max(max, letterIndex(b.column)), 0);
  const next = [...headings.keys()].find((l) => letterIndex(l) > last) ?? "";
  return { column: next, label: headings.get(next) || next, minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: null };
}

/** The layout as sent: text trimmed, empty condition lines and links dropped. */
export function cleanLayout(layout: Layout): Layout {
  return {
    ...layout,
    name: layout.name.trim(),
    currency: layout.currency.trim().toUpperCase(),
    defaultCountry: layout.defaultCountry.trim().toUpperCase(),
    bands: layout.bands.map((b) => ({ ...b, label: b.label.trim() })),
    conditions: layout.conditions.map((c) => c.trim()).filter(Boolean),
    links: layout.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.label || l.url),
  };
}

/** What keeps the form from being sent, in words; empty when it can be. The server checks the rest. */
export function layoutProblems(layout: Layout): string[] {
  const problems: string[] = [];
  if (!layout.columns.place) problems.push("Choose the column of the place");
  if (!(layout.firstDataRow > layout.headerRow)) problems.push("The first price row must come after the headings row");
  if (layout.lastDataRow !== null && layout.lastDataRow < layout.firstDataRow) problems.push("The last price row comes before the first");
  if (!layout.bands.length) problems.push("Add at least one price column");
  if (layout.bands.some((b) => !b.column || !b.label.trim())) problems.push("Every price column needs its column and a label");
  if (layout.bands.some((b) => !(b.minLengthFt > 0) || !(b.maxLengthFt >= b.minLengthFt))) problems.push("A price column's lengths are not right");
  if (new Set(layout.bands.map((b) => b.column)).size !== layout.bands.length) problems.push("A column is used for two price columns");
  // Prices are kept by container length and weight, so two price columns must differ in one of them.
  if (new Set(layout.bands.map((b) => `${b.minLengthFt}-${b.maxLengthFt}-${b.maxGrossTonnes}`)).size !== layout.bands.length) {
    problems.push("Two price columns have the same lengths and weight");
  }
  if (!/^[A-Za-z]{3}$/.test(layout.currency.trim())) problems.push("The currency is a 3-letter code, e.g. EUR");
  if (!/^[A-Za-z]{2}$/.test(layout.defaultCountry.trim())) problems.push("The country is a 2-letter code, e.g. CZ");
  if (layout.validFrom && layout.validTo && layout.validTo < layout.validFrom) problems.push("The validity ends before it starts");
  if (!layout.name.trim()) problems.push("The layout needs a name");
  return problems;
}

/** "rows 22, 45, 61 …": the rows a finding names, with an ellipsis when it has more. */
export function findingRowsText(finding: Pick<interfaces.TariffFinding, "rows" | "count">): string {
  if (!finding.rows.length) return "";
  const more = finding.count > finding.rows.length ? " …" : "";
  return `${finding.rows.length === 1 && !more ? "row" : "rows"} ${finding.rows.join(", ")}${more}`;
}
