import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { CollectionLayout } from "../interfaces/interfaces";
import { parseCollectionLayout, tidyCollectionLayout } from "../lib/collectionLayout";
import { sheetExcerpt, type Sheet } from "../lib/sheet";

// The AI reads where a first / last mile haulier's tariff file keeps each part - the price tables
// (weight rows × zone columns, one per country), how a zone is found (the distance between the two
// ends from the tariff's own postcode → region and region → km lists, or the customer's postcode
// area), how volume counts as weight, the surcharges and terms - from every sheet, hidden ones and
// a calculator's formulas included. It never copies prices: the code reads every figure.

const anthropicApiKey = secret("ANTHROPIC_API_KEY");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// The most sheets shown to the AI; a calculator workbook has around ten.
const MAX_SHEETS = 15;

const PROMPT = `You read first / last mile hauliers' tariffs: Excel price lists for collecting and delivering LCL and air consignments (parcels, pallets) between a freight forwarder's hub and its customers. You describe where the file keeps each part, so a program can read every figure exactly. You never copy prices.
Call record_layout once. The model every tariff is read into:
- matrices: price tables of weight rows × zone columns, one per country of the customer's end (e.g. "CZ → CZ" for Czechia, "CZ → SK" for Slovakia). For each: label, country (ISO code of the customer's end), sheet, headerRow (the row of the zone headings), firstDataRow and lastDataRow (the weight rows; lastDataRow null when they run to the end of the sheet), weightTo (the column with the heaviest weight in kg a row is for: "do kg", "up to kg", "bis kg"), volumeTo (the column with the largest volume in m³ a row is for, when the tariff counts a volume as that row's weight; null otherwise), zones (one per price column, in sheet order: column letter, label = its heading, kmTo for distance zones ("200 km" gives 200), zone for postcode-area zones).
- Prefer a visible price-list sheet with the final prices (after any discount) over hidden calculation sheets; use a hidden sheet only when no visible one has the prices.
- zoneBy: "distance" when the price column is the distance between the two ends (km headings), "postcode" when it is the customer's postcode area or zone.
- By distance: regions = the sheet listing postcodes with the tariff's region (postcode, region, country and place columns; countryCodes maps what the country column holds to ISO codes, e.g. {"1": "CZ", "2": "SK"}; defaultCountry for rows without one). distances = the sheet listing region pairs with their km (fromRegion, toRegion, km). These lists are often on hidden sheets. sameRegionKm: the km two places of one region count as, when stated; else null. areas null.
- By postcode: areas = the sheet listing postcodes or postcode ranges with their zone (postcodeFrom, postcodeTo or null when one column holds a postcode or a prefix such as "1xxxx", zone, country). regions and distances null.
- kgPerCbm: kg one m³ counts as, when the tariff converts volume by a factor ("1 m³ = 250 kg"); else null.
- surcharges: what is added to the table price by rule, read from the text and from formulas (shown as {=…}): oversize (overLengthCm and percent: e.g. a piece longer than 350 cm adds 50 % of the price), percent (always added, e.g. a fuel surcharge of 12 %), flat (an amount per consignment always added). Leave out what is included ("v ceně", "inclusive"), optional services, and charges that depend on what a quote does not know (cash on delivery, waiting time, insurance above a value).
- currency: the ISO code of the prices (Kč gives CZK). validFrom and validTo: the validity as YYYY-MM-DD ("Platnost nabídky" or "valid until" is the last day; a price list's own date is no validity); null when not given.
- conditions: short lines in English with what the prices include, delivery times, the terms, and the optional services and fees the file names, with their prices where it gives them. Only what is written; invent nothing.
- links: the web links in the file, each with a short label (leave out e-mail addresses).
- name: a short name for the tariff, e.g. "TOPTRANS – CZ / SK".
When the layout the haulier's previous tariff was read with is given, keep what still fits this file and change what differs. Always take validity and conditions from this file.`;

const letter = { type: ["string", "null"], description: "Column letter, e.g. C; null when there is none" };
const rows = {
  sheet: { type: "string" },
  firstDataRow: { type: "integer" },
  lastDataRow: { type: ["integer", "null"] },
};

const LAYOUT_TOOL: Anthropic.Tool = {
  name: "record_layout",
  description: "Records where the collections tariff's file keeps each part.",
  input_schema: {
    type: "object",
    required: ["name", "currency", "validFrom", "validTo", "zoneBy", "matrices", "kgPerCbm", "regions", "distances", "sameRegionKm", "areas", "surcharges", "conditions", "links"],
    properties: {
      name: { type: "string" },
      currency: { type: "string" },
      validFrom: { type: ["string", "null"], description: "YYYY-MM-DD" },
      validTo: { type: ["string", "null"], description: "YYYY-MM-DD" },
      zoneBy: { type: "string", enum: ["distance", "postcode"] },
      matrices: {
        type: "array",
        items: {
          type: "object",
          required: ["label", "country", "sheet", "headerRow", "firstDataRow", "lastDataRow", "weightTo", "volumeTo", "zones"],
          properties: {
            label: { type: "string" },
            country: { type: "string", description: "ISO 3166-1 alpha-2 of the customer's end" },
            headerRow: { type: "integer" },
            ...rows,
            weightTo: { type: "string", description: "Column letter of the heaviest kg a row is for" },
            volumeTo: letter,
            zones: {
              type: "array",
              items: {
                type: "object",
                required: ["column", "label", "kmTo", "zone"],
                properties: { column: { type: "string" }, label: { type: "string" }, kmTo: { type: ["number", "null"] }, zone: { type: ["string", "null"] } },
              },
            },
          },
        },
      },
      kgPerCbm: { type: ["number", "null"] },
      regions: {
        type: ["object", "null"],
        required: ["sheet", "firstDataRow", "lastDataRow", "postcode", "region", "country", "place", "countryCodes", "defaultCountry"],
        properties: {
          ...rows,
          postcode: { type: "string" },
          region: { type: "string" },
          country: letter,
          place: letter,
          countryCodes: { type: "object", additionalProperties: { type: "string" } },
          defaultCountry: { type: "string" },
        },
      },
      distances: {
        type: ["object", "null"],
        required: ["sheet", "firstDataRow", "lastDataRow", "fromRegion", "toRegion", "km"],
        properties: { ...rows, fromRegion: { type: "string" }, toRegion: { type: "string" }, km: { type: "string" } },
      },
      sameRegionKm: { type: ["number", "null"] },
      areas: {
        type: ["object", "null"],
        required: ["sheet", "firstDataRow", "lastDataRow", "postcodeFrom", "postcodeTo", "zone", "country", "defaultCountry"],
        properties: { ...rows, postcodeFrom: { type: "string" }, postcodeTo: letter, zone: { type: "string" }, country: letter, defaultCountry: { type: "string" } },
      },
      surcharges: {
        type: "array",
        items: {
          type: "object",
          required: ["kind", "label", "overLengthCm", "percent", "amount"],
          properties: {
            kind: { type: "string", enum: ["oversize", "percent", "flat"] },
            label: { type: "string" },
            overLengthCm: { type: ["number", "null"] },
            percent: { type: ["number", "null"] },
            amount: { type: ["number", "null"] },
          },
        },
      },
      conditions: { type: "array", items: { type: "string" } },
      links: {
        type: "array",
        items: { type: "object", required: ["label", "url"], properties: { label: { type: "string" }, url: { type: "string" } } },
      },
    },
  },
};

function client(): Anthropic {
  return new Anthropic({ apiKey: anthropicApiKey() || process.env.ANTHROPIC_API_KEY });
}

/** The text the AI is given: each sheet's excerpt with its formulas, and the haulier's previous layout when there is one. */
export function collectionRequestText(sheets: Sheet[], previous: CollectionLayout | null): string {
  const parts = sheets.slice(0, MAX_SHEETS).map((sheet) => sheetExcerpt(sheet, { formulas: true }));
  if (previous) parts.push(`The haulier's previous tariff was read with this layout:\n${JSON.stringify(previous)}`);
  return parts.join("\n\n");
}

/** How the AI reads the collections tariff file's layout; refused when the AI is unreachable or answers something unusable. */
export async function readCollectionLayout(sheets: Sheet[], previous: CollectionLayout | null): Promise<CollectionLayout> {
  let message: Anthropic.Message;
  try {
    message = await client().messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: PROMPT,
      tools: [LAYOUT_TOOL],
      tool_choice: { type: "tool", name: LAYOUT_TOOL.name },
      messages: [{ role: "user", content: collectionRequestText(sheets, previous) }],
    });
  } catch (err) {
    log.error(err, "collections tariff: AI layout read failed", { model: MODEL });
    throw APIError.unavailable("The AI could not read the tariff file just now. Try the upload again in a moment.");
  }
  const call = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!call) throw APIError.unavailable("The AI did not describe the tariff file. Try the upload again.");
  try {
    return parseCollectionLayout(tidyCollectionLayout(call.input));
  } catch (err) {
    log.warn(err, "collections tariff: AI layout not usable", { input: JSON.stringify(call.input).slice(0, 3000) });
    throw APIError.unavailable(`The AI's reading of the file was not usable (${err instanceof Error ? err.message : "unknown problem"}). Try the upload again.`);
  }
}
