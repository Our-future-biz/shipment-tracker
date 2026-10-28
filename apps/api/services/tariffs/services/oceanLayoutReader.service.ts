import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { OceanLayout } from "../interfaces/interfaces";
import { parseOceanLayout, tidyOceanLayout } from "../lib/oceanLayout";
import { sheetExcerpt, type Sheet } from "../lib/sheet";

// The AI reads where a shipping line's tariff file keeps each rate table - the ports of loading and
// discharge, the transshipment port, the price per container, the currency - what the short port
// codes stand for, and every surcharge rule written under the tables. It never copies rates: the
// code reads every row, and matches the port names to the UN/LOCODE place list itself.

const anthropicApiKey = secret("ANTHROPIC_API_KEY");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// The most sheets shown to the AI; a carrier's rate document has around fifteen.
const MAX_SHEETS = 20;

const PROMPT = `You read shipping lines' FCL tariffs: Excel rate documents of ocean freight per container between ports of loading (POL) and ports of discharge (POD). You describe where the file keeps each part, so a program can read every rate exactly. You never copy rates.
Call record_layout once. The model every tariff is read into:
- tables: every block of rates with its own headings, in sheet order. One table per block: a sheet with "direct calls", "transshipments", "wing ports" and "Japan" blocks gives one table each. For each: label (what the block is, e.g. "Far East direct calls", "Far East wing ports", "Reefer Far East"), sheet, headerRow (the row of the block's column headings), firstDataRow and lastDataRow (its rate rows only, not the headings, notes or surcharge text below it; lastDataRow null only when the rates run to the end of the sheet).
- pol: the column with the port(s) of loading; null when the block has none, and then polFixed = the ports of loading as the sheet states them for that block (e.g. "HAM / WVN / RTM / ANR / ZEE" from the main block above it, "Koper; Trieste", "Hamburg/Wilhelmshaven/Rotterdam/Antwerpen" from a heading).
- pod: the column with the port of discharge. via: the column with the transshipment port(s), null when none. note: a column with remarks, null when none.
- currency: the column with each row's currency (USD, EUR), null when none; then currencyFixed = the currency of the block's rates. A number cell shows the currency of its format as [USD] or [EUR] after its value: use it. "EUR Payment!" or € formats mean EUR.
- prices: one per price column: column letter, equipment and label (its heading). equipment: "20DC" for 20' dry (20' Box, 20' GP, 20' DV), "40DC" for 40' dry (40' Box, 40' GP), "40HC" for 40' high cube dry (40' HQ, 40' HC), "20RF" for 20' reefer (20RF, Ocean Rate 20 on a reefer sheet), "40RF" for 40' reefer (40RQ, 40RH, 40' reefer high cube, Ocean Rate 40H on a reefer sheet). Leave out special equipment (open top, flat rack, OT, FR, OQ, FQ, in gauge, over height, over width) entirely: no table for it.
- podCountries: the ISO codes of the countries the block's ports of discharge are in (e.g. Far East: CN, HK, TW, KR, JP, SG, MY, VN, TH, ID, PH, KH, MM); empty when they are spread over the world.
- portCodes: what every short port code or bare port name in a port-of-loading cell or polFixed stands for, as UN/LOCODE: e.g. {"HAM": "DEHAM", "BHV": "DEBRV", "WVN": "DEWVN", "WHV": "DEWVN", "RTM": "NLRTM", "ANR": "BEANR", "ZEE": "BEZEE", "Koper": "SIKOP", "Trieste": "ITTRS"}. Only codes you are sure of. Ports of discharge are matched by the program; do not list them.
- surcharges: every surcharge or fee written under the rate tables ("plus following surcharges"), one per rule and sheet: name, code (its short code, e.g. EBS, LSA, ETS, PSS, AMS, DOC, MBF, IMO, WRS, WRP, ISPS, LFN, CLE), amount and currency (the amount valid from the tariff's start; when a rule gives an earlier and a later amount, take the one for the tariff's validity), basis ("teu" per TEU, "container" per container/cont./CTR, "bl" per B/L, "booking" per booking), equipment (["dry"] for dry boxes, ["reefer"] for reefers, empty for both: a sheet of dry rates gives ["dry"], a reefer sheet ["reefer"]), tables (the indexes of the tables it is added to: those of its sheet), countries / exceptCountries (ISO codes of PODs it is only for / not for, e.g. "except FND Taiwan" gives exceptCountries ["TW"], "Middle East Gulf region" the Gulf countries), ports / exceptPorts (UN/LOCODEs of PODs it is only for / not for, e.g. "for Lagos only" gives ["NGAPP", "NGLOS"]), condition ("dangerous" for IMO/DG surcharges, "manual_booking" for fees only charged on a booking or B/L not made electronically, else "always"), charge ("fcl_baf" for bunker, fuel and low-sulphur surcharges such as EBS, BAF, LSA; "ams_ens" for AMS/ENS manifest fees; "fcl_documentation" for B/L or documentation fees; "other" for the rest). Leave out what is "included" or "incl.", charges that depend on things a quote does not know (cargo value, port storage, cleaning in a foreign currency like BDT, PSA dangerous-goods groups, cancellation, amendments), and origin and destination local charges kept on the carrier's website.
- validFrom and validTo: the validity as YYYY-MM-DD ("valid as from 01.05.2026 - 31.05.2026").
- conditions: short lines in English with the terms: rate date rule (sailing / gate-in / on-board date), freight prepaid only, free time, local charges not included, the restricted commodities, dangerous-goods and reefer acceptance, and the surcharges left out above with their amounts. Only what is written.
- links: the web links in the file with a short label (no e-mail addresses). name: a short name, e.g. "OOCL Export FAK – Far East, India, Australia, Intra Europe, Africa".
Prefer visible sheets with the final rates over hidden calculation sheets. When the layout the line's previous tariff was read with is given, keep what still fits this file and change what differs; always take validity, amounts and conditions from this file.`;

const letter = { type: ["string", "null"], description: "Column letter, e.g. C; null when there is none" };
const strings = { type: "array", items: { type: "string" } };

const LAYOUT_TOOL: Anthropic.Tool = {
  name: "record_layout",
  description: "Records where the shipping line's tariff file keeps each part.",
  input_schema: {
    type: "object",
    required: ["name", "validFrom", "validTo", "tables", "portCodes", "surcharges", "conditions", "links"],
    properties: {
      name: { type: "string" },
      validFrom: { type: ["string", "null"], description: "YYYY-MM-DD" },
      validTo: { type: ["string", "null"], description: "YYYY-MM-DD" },
      tables: {
        type: "array",
        items: {
          type: "object",
          required: ["label", "sheet", "headerRow", "firstDataRow", "lastDataRow", "pol", "polFixed", "pod", "via", "currency", "currencyFixed", "prices", "note", "podCountries"],
          properties: {
            label: { type: "string" },
            sheet: { type: "string" },
            headerRow: { type: "integer" },
            firstDataRow: { type: "integer" },
            lastDataRow: { type: ["integer", "null"] },
            pol: letter,
            polFixed: { type: ["string", "null"] },
            pod: { type: "string", description: "Column letter of the port of discharge" },
            via: letter,
            currency: letter,
            currencyFixed: { type: ["string", "null"] },
            prices: {
              type: "array",
              items: {
                type: "object",
                required: ["column", "equipment", "label"],
                properties: { column: { type: "string" }, equipment: { type: "string", enum: ["20DC", "40DC", "40HC", "20RF", "40RF"] }, label: { type: "string" } },
              },
            },
            note: letter,
            podCountries: strings,
          },
        },
      },
      portCodes: { type: "object", additionalProperties: { type: "string" } },
      surcharges: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "code", "amount", "currency", "basis", "equipment", "tables", "countries", "exceptCountries", "ports", "exceptPorts", "condition", "charge"],
          properties: {
            name: { type: "string" },
            code: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            basis: { type: "string", enum: ["teu", "container", "bl", "booking"] },
            equipment: { type: "array", items: { type: "string", enum: ["dry", "reefer"] } },
            tables: { type: "array", items: { type: "integer" } },
            countries: strings,
            exceptCountries: strings,
            ports: strings,
            exceptPorts: strings,
            condition: { type: "string", enum: ["always", "dangerous", "manual_booking"] },
            charge: { type: "string", enum: ["fcl_baf", "ams_ens", "fcl_documentation", "other"] },
          },
        },
      },
      conditions: strings,
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

/** The text the AI is given: each sheet's excerpt (with currencies and formulas), and the line's previous layout when there is one. */
export function oceanRequestText(sheets: Sheet[], previous: OceanLayout | null): string {
  const parts = sheets.slice(0, MAX_SHEETS).map((sheet) => sheetExcerpt(sheet, { formulas: !sheet.hidden }));
  if (previous) parts.push(`The shipping line's previous tariff was read with this layout:\n${JSON.stringify(previous)}`);
  return parts.join("\n\n");
}

/** How the AI reads the tariff file's layout; refused when the AI is unreachable or answers something unusable. */
export async function readOceanLayout(sheets: Sheet[], previous: OceanLayout | null): Promise<OceanLayout> {
  let message: Anthropic.Message;
  try {
    message = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: PROMPT,
      tools: [LAYOUT_TOOL],
      tool_choice: { type: "tool", name: LAYOUT_TOOL.name },
      messages: [{ role: "user", content: oceanRequestText(sheets, previous) }],
    });
  } catch (err) {
    log.error(err, "ocean tariff: AI layout read failed", { model: MODEL });
    throw APIError.unavailable("The AI could not read the tariff file just now. Try the upload again in a moment.");
  }
  const call = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!call) throw APIError.unavailable("The AI did not describe the tariff file. Try the upload again.");
  try {
    return parseOceanLayout(tidyOceanLayout(call.input));
  } catch (err) {
    log.warn(err, "ocean tariff: AI layout not usable", { input: JSON.stringify(call.input).slice(0, 3000) });
    throw APIError.unavailable(`The AI's reading of the file was not usable (${err instanceof Error ? err.message : "unknown problem"}). Try the upload again.`);
  }
}
