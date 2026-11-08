import { CONTAINER_TYPES } from "@/lib/cargo";
import { PACKING_TYPES, type PackageLine, type QuoteContainerLine } from "@/app/sales/_lib/types";

// A quote's container and package lines as one line of text, the way the Quote reading returns them
// (normalizeQuoteFields in apps/api/services/extraction/lib/quoteFields.ts) and the review shows and
// edits them: entries joined with "; ".
//   Containers: "2 x 20' DC, 18000 kg; 1 x 40' HC" - the weight is the cargo in one container.
//   Packages:   "4 x Pallets, 120 x 80 x 150 cm, 450 kg each; 3 pcs, 200 x 100 x 90 cm"
// Reading text back takes only the quote's own types; anything else makes the whole list unreadable,
// so a list is written whole or not at all.

const num = (text: string): number | undefined => {
  const value = Number(text.replace(/ /g, ""));
  return /^\d[\d ]*(\.\d+)?$/.test(text) && value > 0 ? value : undefined;
};

const entriesOf = (text: string) =>
  text
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean);

const caseless = (options: readonly string[], text: string) => options.find((o) => o.toLowerCase() === text.trim().toLowerCase());

export function containersText(lines: readonly QuoteContainerLine[]): string {
  return lines.map((l) => `${l.qty} x ${l.type}${l.weight ? `, ${l.weight} kg` : ""}`).join("; ");
}

export function packagesText(lines: readonly PackageLine[]): string {
  return lines
    .map((l) => {
      const head = l.type ? `${l.qty} x ${l.type}` : `${l.qty} pcs`;
      const size = l.length && l.width && l.height ? `, ${l.length} x ${l.width} x ${l.height} cm` : "";
      return `${head}${size}${l.weight ? `, ${l.weight} kg each` : ""}`;
    })
    .join("; ");
}

/** The container lines a text names; undefined when any entry is not "<n> x <type>[, <kg> kg]". */
export function containersFromText(text: string): QuoteContainerLine[] | undefined {
  const entries = entriesOf(text);
  if (!entries.length) return undefined;
  const lines: QuoteContainerLine[] = [];
  for (const entry of entries) {
    const m = entry.match(/^(\d{1,3})\s*x\s*([^,]+?)\s*(?:,\s*([\d .]+?)\s*kg)?$/i);
    const qty = m ? Number(m[1]) : 0;
    const type = m ? caseless(CONTAINER_TYPES, m[2]!) : undefined;
    const weight = m?.[3] !== undefined ? num(m[3]) : undefined;
    if (!qty || !type || (m?.[3] !== undefined && !weight)) return undefined;
    lines.push(weight ? { qty, type, weight } : { qty, type });
  }
  return lines;
}

/** The package lines a text names; undefined when any entry is not "<n> x <type>|<n> pcs[, LxWxH cm][, <kg> kg each]". */
export function packagesFromText(text: string): PackageLine[] | undefined {
  const entries = entriesOf(text);
  if (!entries.length) return undefined;
  const lines: PackageLine[] = [];
  for (const entry of entries) {
    const [head = "", ...parts] = entry.split(",").map((p) => p.trim());
    const pieces = head.match(/^(\d{1,4})\s*pcs$/i);
    const typed = head.match(/^(\d{1,4})\s*x\s*(.+)$/i);
    const qty = Number((pieces ?? typed)?.[1]);
    const type = pieces ? "" : typed ? caseless(PACKING_TYPES, typed[2]!) : undefined;
    if (!qty || type === undefined) return undefined;
    const line: PackageLine = { qty, type };
    for (const part of parts) {
      const size = part.match(/^([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*cm$/i);
      const kg = part.match(/^([\d .]+?)\s*kg(?:\s+each)?$/i);
      if (size) {
        const [length, width, height] = size.slice(1).map((n) => num(n!));
        if (!length || !width || !height) return undefined;
        Object.assign(line, { length, width, height });
      } else if (kg && num(kg[1]!)) {
        line.weight = num(kg[1]!);
      } else {
        return undefined;
      }
    }
    lines.push(line);
  }
  return lines;
}
