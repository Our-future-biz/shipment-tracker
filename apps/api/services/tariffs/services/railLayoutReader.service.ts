import type Anthropic from "@anthropic-ai/sdk";
import type { RailLayout } from "../interfaces/interfaces";
import { askLayout } from "../lib/anthropic";
import { parseRailLayout, tidyAiLayout } from "../lib/railLayout";
import { sheetExcerpt, type Sheet } from "../lib/sheet";

// The AI reads how a rail tariff's sheet is laid out - which row holds the headings, what each
// column means, the price columns' container lengths and weights, validity and terms - from
// the top rows and a sample of the rest. It never copies prices: the code reads every row with the
// layout, so no figure can be retyped wrongly.

// The most sheets shown to the AI; a tariff file rarely has more than one or two.
const MAX_SHEETS = 5;

const PROMPT = `You read suppliers' rail tariffs: Excel price lists of container rail transport between sea ports and inland places. You describe how the sheet is laid out, so a program can read every price row exactly. You never copy prices.
Call record_layout once. Rules:
- sheet: the name of the sheet that holds the price table.
- headerRow: the row number of the price table's column headings. firstDataRow: the first row with prices. lastDataRow: the last row with prices when notes, totals or other tables follow the price table; null when the prices run to the end of the sheet.
- columns: the column letters of country, postcode (ZIP, PSČ, PLZ), place (the inland town), region, via (the rail terminal the train runs via), emptyDepot (where the empty container is returned or picked up), note, validFrom and validTo. When one column holds both terminal and depot, like "Praha/Praha", give its letter for both via and emptyDepot. null when there is no such column. Leave out columns that only repeat others, e.g. "Destination (Region)".
- bands: one per price column, in sheet order. label: the heading as written. minLengthFt and maxLengthFt: the container lengths in feet the price is for (20' gives 20 and 20; 21'-29' gives 21 and 29; 40' gives 40 and 40). maxGrossTonnes: the heaviest gross weight the price allows ("0<14 t" and "<14 t" give 14; "up to 25 t" gives 25); null when the heading sets no weight.
- currency: the ISO code of the prices, e.g. EUR or CZK.
- validFrom and validTo: the tariff's validity as YYYY-MM-DD, from the text (e.g. "VALIDITY 01.01.2026 - 31.12.2026"), else from the rows' validity columns; null when not given.
- defaultCountry: the ISO 3166-1 alpha-2 code of the inland places, e.g. "CZ".
- conditions: short lines in English with what the prices include and the terms the sheet states (all-in, customs documents, road tolls, VAT, how weight is counted, surcharges, empty positioning). Only what is written; invent nothing.
- links: the web links in the sheet, each with a short label (leave out e-mail addresses).
- name: a short name for the tariff, e.g. "Hamburg / Bremerhaven / Wilhelmshaven – Czechia".
When the layout the supplier's previous tariff was read with is given, keep what still fits this file and change what differs. Always take validity and conditions from this file.`;

const letter = { type: ["string", "null"], description: "Column letter, e.g. C; null when there is no such column" };

const LAYOUT_TOOL: Anthropic.Tool = {
  name: "record_layout",
  description: "Records how the rail tariff's sheet is laid out.",
  input_schema: {
    type: "object",
    required: ["sheet", "headerRow", "firstDataRow", "lastDataRow", "columns", "bands", "currency", "validFrom", "validTo", "defaultCountry", "conditions", "links", "name"],
    properties: {
      sheet: { type: "string" },
      headerRow: { type: "integer" },
      firstDataRow: { type: "integer" },
      lastDataRow: { type: ["integer", "null"] },
      columns: {
        type: "object",
        required: ["country", "postcode", "place", "region", "via", "emptyDepot", "note", "validFrom", "validTo"],
        properties: {
          country: letter,
          postcode: letter,
          place: { type: "string", description: "Column letter of the inland place" },
          region: letter,
          via: letter,
          emptyDepot: letter,
          note: letter,
          validFrom: letter,
          validTo: letter,
        },
      },
      bands: {
        type: "array",
        items: {
          type: "object",
          required: ["column", "label", "minLengthFt", "maxLengthFt", "maxGrossTonnes"],
          properties: {
            column: { type: "string" },
            label: { type: "string" },
            minLengthFt: { type: "number" },
            maxLengthFt: { type: "number" },
            maxGrossTonnes: { type: ["number", "null"] },
          },
        },
      },
      currency: { type: "string" },
      validFrom: { type: ["string", "null"], description: "YYYY-MM-DD" },
      validTo: { type: ["string", "null"], description: "YYYY-MM-DD" },
      defaultCountry: { type: "string" },
      conditions: { type: "array", items: { type: "string" } },
      links: {
        type: "array",
        items: { type: "object", required: ["label", "url"], properties: { label: { type: "string" }, url: { type: "string" } } },
      },
      name: { type: "string" },
    },
  },
};

/** The text the AI is given: each sheet's excerpt, and the supplier's previous layout when there is one. */
function layoutRequestText(sheets: Sheet[], previous: RailLayout | null): string {
  const parts = sheets.slice(0, MAX_SHEETS).map((sheet) => sheetExcerpt(sheet));
  if (previous) parts.push(`The supplier's previous tariff was read with this layout:\n${JSON.stringify(previous)}`);
  return parts.join("\n\n");
}

/** How the AI reads the tariff file's layout; refused when the AI is unreachable or answers something unusable. */
export async function readRailLayout(sheets: Sheet[], previous: RailLayout | null): Promise<RailLayout> {
  return askLayout({
    kind: "rail tariff",
    system: PROMPT,
    tool: LAYOUT_TOOL,
    text: layoutRequestText(sheets, previous),
    maxTokens: 4000,
    parse: (input) => parseRailLayout(tidyAiLayout(input)),
  });
}
