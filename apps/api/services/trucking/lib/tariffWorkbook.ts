import ExcelJS from "exceljs";
import { isRealYmd } from "../../../lib/businessDate";
import { SERVICE_LEVEL_CODES } from "./settingsRules";
import { bandLabel, showPostcode } from "./rateEngine";
import type {
  BandBasis,
  ImportSheetReport,
  PriceType,
  ServiceLevelCode,
  SurchargeCalc,
  SurchargeCode,
  TariffBand,
  TariffFactors,
  TariffRate,
  TariffScope,
  TariffSide,
  TariffSurcharge,
  TariffVersionInput,
  TariffZone,
  ValidationFinding,
  ZoneBy,
} from "../interfaces/interfaces";

// The standard tariff workbook: one .xlsx per tariff version. writeTariffWorkbook turns a version
// into the file people fill in; readTariffWorkbook turns a filled file back into a version input,
// with the problems it met (sheet, row and column) and what it made of each sheet. Exporting a
// version and importing the file unchanged gives the same input back.
//
// Sheets: Read me (ignored on import), Meta (Field | Value), Zones, one sheet per service level
// (bands in rows, zones in columns, a last MIN row), Surcharges. Reading is split in two: loading
// the file into plain tables (exceljs) and the pure parse of those tables.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** What an .xlsx may unpack to (its parts as its zip directory declares them); a tariff file is a few MB. */
export const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;
export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const READ_ME = "Read me";
const META = "Meta";
const ZONES = "Zones";
const SURCHARGES = "Surcharges";

const BASES: readonly BandBasis[] = ["KG", "PALLET", "LDM", "TRIP"];
const PRICE_TYPES: readonly PriceType[] = ["FLAT", "PER_UNIT", "PER_100KG"];
const SURCHARGE_CODES: readonly SurchargeCode[] = [
  "FUEL", "TOLL", "ADR", "TAIL_LIFT", "AVIZACE", "TIME_WINDOW", "B2C", "WAITING_TIME", "REDELIVERY", "INSURANCE", "REMOTE_AREA", "NON_STACKABLE",
];
const SURCHARGE_CALCS: readonly SurchargeCalc[] = ["PCT", "FLAT", "PER_KG", "PER_PALLET", "PER_HOUR", "PCT_OF_VALUE", "FUEL_INDEX"];

/** Header rows the reader looks for (first cell, lower case) within the first rows of a sheet. */
const HEADER_SEARCH_ROWS = 10;
/** Rows below the data that still get the dropdowns, so added rows have them too. */
const SPARE_ROWS = 50;
/** Reading stops here: a tariff never needs more, and a stray formatted cell far down costs nothing. */
const MAX_ROWS = 5000;
const MAX_COLUMNS = 1100;

// ---- writing -------------------------------------------------------------------------------------

/** What the file says about the tariff (information rows on Meta, not read back). */
export interface WorkbookTariffInfo {
  name: string;
  side: TariffSide;
  scope: TariffScope;
  ownerName: string | null;
  currency: "CZK" | "EUR";
  zoneBy: ZoneBy;
}

export interface WorkbookContent {
  tariff: WorkbookTariffInfo;
  input: TariffVersionInput;
  /** Level labels from the Trucking settings, for A1 of each level sheet */
  levelLabels: Partial<Record<ServiceLevelCode, string>>;
  /** Level sheets written even without prices (the empty template's D1) */
  extraLevels?: ServiceLevelCode[];
}

const BOLD = { bold: true };
const INFO_FONT = { italic: true, color: { argb: "FF808080" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
const AMOUNT_FORMAT = "#,##0.00";

const listValidation = (values: readonly string[]): ExcelJS.DataValidation => ({
  type: "list",
  allowBlank: true,
  formulae: [`"${values.join(",")}"`],
  showErrorMessage: true,
  errorTitle: "Not in the list",
  error: `Use one of: ${values.join(", ")}`,
});

const YES_NO = ["Y", "N"];

function styleHeader(row: ExcelJS.Row) {
  row.font = BOLD;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
}

/** Puts a dropdown on rows from..to of a column. */
function dropdown(ws: ExcelJS.Worksheet, column: number, from: number, to: number, values: readonly string[]) {
  const validation = listValidation(values);
  for (let r = from; r <= to; r++) ws.getCell(r, column).dataValidation = validation;
}

const ymdDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

const READ_ME_LINES: [string, boolean?][] = [
  ["How to fill in this tariff file", true],
  [""],
  ["Upload the filled file in Trucking → Tariffs → (the tariff) → Upload file. Every upload makes a new DRAFT version:"],
  ["you see every problem with its sheet, row and column, the changes against the active version and test prices"],
  ["before anything is activated. Nothing changes for quotes until you activate the draft."],
  [""],
  ["Sheet Meta", true],
  ["Valid from: a date (2026-11-01, 1. 11. 2026 or an Excel date). Valid to: empty = open-ended."],
  ["kg per LDM, kg per m³, kg per pallet place: the chargeable weight factors (empty = the Trucking settings)."],
  ["Weight step kg: chargeable weight is rounded up to it (1 = whole kg). Money step: each price line is rounded to it (0.01 or 1)."],
  ["The grey rows (tariff, side, owner…) are for information only and are not read back."],
  [""],
  ["Sheet Zones", true],
  ["One row per zone: Zone code | Label | PSČ from | PSČ to | Remote. Postcodes as 110 00, 11000 or the number 11000."],
  ["Ranges may nest: the narrowest range wins (e.g. a remote sub-zone inside a region). They must not cross."],
  ["Remote = Y adds the REMOTE_AREA surcharge in that zone (Y / N / Ano / Ne, empty = N)."],
  [""],
  ["Price sheets (one per service level)", true],
  ["Named exactly D1, D2, D3, D4, EXP_SAMEDAY, EXP_1000, EXP_1200 or EXP_FIXED. No sheet = the level is not offered."],
  ["To add a level, copy a sheet and rename it; to stop offering one, delete its sheet."],
  ["Row 3 is the header: Basis | From (excl.) | To (incl.) | Price type | one column per zone code (as on Zones)."],
  ["Each row below is a band: more than From, up to and including To. Leave To empty in the top band (open-ended)."],
  ["Basis: KG (chargeable weight), PALLET (pallet places), LDM (loading metres) or TRIP (one price per trip)."],
  ["Price type: FLAT = the price of the shipment; PER_UNIT = per kg / pallet / LDM; PER_100KG = per started 100 kg."],
  ["An empty cell means no price for that zone and band. The row with Basis MIN holds the minimum charge per zone."],
  ["A band is the same band on every sheet: use the same From / To on all sheets of one basis."],
  [""],
  ["Sheet Surcharges", true],
  ["Code | Calculation | Value | Minimum | On freight + surcharges (Y = the % is taken of freight and the other surcharges)."],
  ["Codes: FUEL, TOLL (always charged); ADR, TAIL_LIFT, AVIZACE, TIME_WINDOW, B2C, NON_STACKABLE, WAITING_TIME, INSURANCE"],
  ["(only when the shipment asks for it); REMOTE_AREA (remote zones); REDELIVERY (charged when it happens)."],
  ["Calculation: PCT (% of freight), FLAT (an amount), PER_KG, PER_PALLET, PER_HOUR (waiting), PCT_OF_VALUE (% of the"],
  ["declared value, insurance), FUEL_INDEX (the month's % from the fuel index; Value is not used)."],
  ["Minimum: the least the surcharge charges (empty = none)."],
  [""],
  ["Numbers", true],
  ["Decimal comma or point both work (12,5 or 12.5); spaces in 1 250 are fine. Formulas are fine: their result is read."],
  ["Amounts are in the tariff currency. Other sheets you add are ignored (you will see a warning)."],
];

/** The tariff version as the standard .xlsx file. */
export async function writeTariffWorkbook(content: WorkbookContent): Promise<Buffer> {
  const { tariff, input, levelLabels } = content;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shipment Tracker";

  // Read me
  const readMe = wb.addWorksheet(READ_ME);
  readMe.getColumn(1).width = 120;
  readMe.addRow([`Trucking tariff: ${tariff.name}`]).font = { bold: true, size: 14 };
  for (const [line, bold] of READ_ME_LINES) {
    const row = readMe.addRow([line]);
    if (bold) row.font = BOLD;
  }

  // Meta
  const meta = wb.addWorksheet(META, { views: [{ state: "frozen", ySplit: 1 }] });
  meta.columns = [{ width: 24 }, { width: 44 }, { width: 70 }];
  styleHeader(meta.addRow(["Field", "Value", "Note"]));
  const info = (field: string, value: string) => {
    const row = meta.addRow([field, value, "Information only, not read on import"]);
    row.font = INFO_FONT;
  };
  info("Tariff", tariff.name);
  info("Side", tariff.side);
  info("Owner", tariff.ownerName ?? (tariff.side === "SELL" ? "Standard" : ""));
  info("Scope", tariff.scope);
  info("Currency", tariff.currency);
  info("Zone taken from", tariff.zoneBy === "ORIGIN" ? "Origin (pick-up) postcode" : "Destination postcode");
  const field = (name: string, value: ExcelJS.CellValue, note: string, numFmt?: string) => {
    const row = meta.addRow([name, value, note]);
    row.getCell(1).font = BOLD;
    if (numFmt) row.getCell(2).numFmt = numFmt;
  };
  field("Valid from", ymdDate(input.validFrom), "A date: 2026-11-01, 1. 11. 2026 or an Excel date", "yyyy-mm-dd");
  field("Valid to", input.validTo ? ymdDate(input.validTo) : null, "Empty = open-ended", "yyyy-mm-dd");
  field("kg per LDM", input.factors.kgPerLdm, "Chargeable kg per loading metre");
  field("kg per m³", input.factors.kgPerCbm, "Chargeable kg per cubic metre");
  field("kg per pallet place", input.factors.kgPerPalletPlace, "Chargeable kg per pallet place");
  field("Weight step kg", input.rounding.weightStepKg, "Chargeable weight is rounded up to this step (1 = whole kg)");
  field("Money step", input.rounding.moneyStep, "Each price line is rounded to this step (0.01 or 1)");
  field("Notes", input.notes, "Free text");

  // Zones
  const zones = wb.addWorksheet(ZONES, { views: [{ state: "frozen", ySplit: 1 }] });
  zones.columns = [{ width: 12 }, { width: 32 }, { width: 11 }, { width: 11 }, { width: 9 }];
  styleHeader(zones.addRow(["Zone code", "Label", "PSČ from", "PSČ to", "Remote"]));
  for (const z of input.zones) zones.addRow([z.code, z.label, showPostcode(z.postcodeFrom), showPostcode(z.postcodeTo), z.remote ? "Y" : "N"]);
  dropdown(zones, 5, 2, input.zones.length + 1 + SPARE_ROWS, YES_NO);

  // One sheet per level
  const levels = SERVICE_LEVEL_CODES.filter((c) => input.rates.some((r) => r.serviceLevel === c) || content.extraLevels?.includes(c));
  for (const level of levels) writeLevelSheet(wb, level, levelLabels[level] ?? level, input);

  // Surcharges
  const sur = wb.addWorksheet(SURCHARGES, { views: [{ state: "frozen", ySplit: 1 }] });
  sur.columns = [{ width: 16 }, { width: 15 }, { width: 10 }, { width: 11 }, { width: 24 }];
  styleHeader(sur.addRow(["Code", "Calculation", "Value", "Minimum", "On freight + surcharges"]));
  for (const s of input.surcharges) sur.addRow([s.code, s.calc, s.value, s.min, s.onBasePlusSurcharges ? "Y" : "N"]);
  const lastSurchargeRow = input.surcharges.length + 1 + SPARE_ROWS;
  dropdown(sur, 1, 2, lastSurchargeRow, SURCHARGE_CODES);
  dropdown(sur, 2, 2, lastSurchargeRow, SURCHARGE_CALCS);
  dropdown(sur, 5, 2, lastSurchargeRow, YES_NO);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const ZONE_COLUMN = 5; // E: the first zone column of a level sheet

function writeLevelSheet(wb: ExcelJS.Workbook, level: ServiceLevelCode, label: string, input: TariffVersionInput) {
  const ws = wb.addWorksheet(level, { views: [{ state: "frozen", ySplit: 3, xSplit: 4 }] });
  ws.getCell("A1").value = `${level}: ${label}`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = "Bands in rows, zones in columns. Empty cell = no price. The MIN row is the minimum charge per zone.";
  ws.getCell("A2").font = INFO_FONT;
  ws.columns = [{ width: 10 }, { width: 13 }, { width: 13 }, { width: 13 }, ...input.zones.map(() => ({ width: 12 }))];
  const header = ws.getRow(3);
  header.values = ["Basis", "From (excl.)", "To (incl.)", "Price type", ...input.zones.map((z) => z.code)];
  styleHeader(header);

  // One row per band and price type (a band whose zones mix price types takes one row per type).
  const bandsById = new Map(input.bands.map((b) => [b.id, b]));
  const rows = new Map<string, { band: TariffBand; priceType: PriceType; amounts: Map<string, number> }>();
  for (const r of input.rates) {
    const band = bandsById.get(r.bandId);
    if (r.serviceLevel !== level || !band) continue;
    const key = `${r.bandId}|${r.priceType}`;
    const row = rows.get(key) ?? { band, priceType: r.priceType, amounts: new Map<string, number>() };
    row.amounts.set(r.zoneCode, r.amount);
    rows.set(key, row);
  }
  const sorted = [...rows.values()].sort(
    (a, b) =>
      BASES.indexOf(a.band.basis) - BASES.indexOf(b.band.basis) ||
      a.band.fromExcl - b.band.fromExcl ||
      PRICE_TYPES.indexOf(a.priceType) - PRICE_TYPES.indexOf(b.priceType),
  );
  let r = 4;
  for (const row of sorted) {
    ws.getRow(r).values = [row.band.basis, row.band.fromExcl, row.band.toIncl, row.priceType, ...input.zones.map((z) => row.amounts.get(z.code) ?? null)];
    r++;
  }
  const mins = new Map(input.minCharges.filter((m) => m.serviceLevel === level).map((m) => [m.zoneCode, m.amount]));
  const minRow = ws.getRow(r);
  minRow.values = ["MIN", null, null, null, ...input.zones.map((z) => mins.get(z.code) ?? null)];
  minRow.font = BOLD;
  for (let c = ZONE_COLUMN; c < ZONE_COLUMN + input.zones.length; c++) ws.getColumn(c).numFmt = AMOUNT_FORMAT;
  dropdown(ws, 1, 4, r + SPARE_ROWS, [...BASES, "MIN"]);
  dropdown(ws, 4, 4, r + SPARE_ROWS, PRICE_TYPES);
}

/** The input of the empty template: Meta from the settings factors, no zones, no prices, the fuel index surcharge. */
export function emptyTemplateInput(factors: TariffFactors, validFrom: string): TariffVersionInput {
  return {
    validFrom,
    validTo: null,
    factors: { kgPerLdm: factors.kgPerLdm, kgPerCbm: factors.kgPerCbm, kgPerPalletPlace: factors.kgPerPalletPlace },
    rounding: { weightStepKg: 1, moneyStep: 0.01 },
    zones: [],
    bands: [],
    rates: [],
    minCharges: [],
    surcharges: [{ code: "FUEL", calc: "FUEL_INDEX", value: 0, min: null, onBasePlusSurcharges: false }],
    notes: "",
  };
}

/** "Standard LTL – Praha" → "standard-ltl-praha" (file names without accents). */
export const fileSlug = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "tariff";

// ---- loading -------------------------------------------------------------------------------------

/** A sheet as plain values: rows[r][c] (0-based) is Excel row r + 1, column c + 1. */
export interface SheetTable {
  name: string;
  rows: unknown[][];
}

/** Why a file cannot be read at all, in plain words; the service turns it into invalid_argument. */
export class UnreadableFileError extends Error {}

// A cell as plain data: dates stay Dates, formulas and rich text give their result / text, the
// covered cells of a merged range are empty (only the top-left cell holds the value).
function cellValue(cell: ExcelJS.Cell): unknown {
  if (cell.isMerged && cell.master.address !== cell.address) return "";
  return plain(cell.value);
}

function plain(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) return plain((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return String(v.error);
  }
  return String(v);
}

/**
 * The total size an .xlsx (a zip) unpacks to, as its central directory declares it, read without
 * unpacking anything; null when the directory cannot be read (or needs ZIP64, which no tariff
 * file does). A cheap first guard against a zip bomb: the sizes are what the file declares (the
 * zip reader of exceljs refuses a part whose unpacked size differs, but only once it is unpacked).
 */
export function zipUnpackedBytes(buf: Buffer): number | null {
  const EOCD = 0x06054b50;
  const CEN = 0x02014b50;
  const from = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirStart = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || dirStart === 0xffffffff || entries > MAX_ZIP_ENTRIES || dirStart + dirSize > eocd) return null;
  let total = 0;
  let p = dirStart;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== CEN) return null;
    const size = buf.readUInt32LE(p + 24);
    if (size === 0xffffffff) return null;
    total += size;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return total;
}

/** The sheets of an .xlsx file as tables; throws UnreadableFileError with a plain reason. */
export async function loadWorkbookTables(buffer: Buffer): Promise<SheetTable[]> {
  if (buffer.length > MAX_FILE_BYTES) throw new UnreadableFileError("The file is larger than 5 MB. A tariff file is normally well under 1 MB: remove pictures or extra sheets.");
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0xd0cf11e0) {
    throw new UnreadableFileError("This is an old Excel 97–2003 (.xls) file. Open it in Excel and save it as Excel Workbook (.xlsx), then upload that.");
  }
  if (buffer.length < 4 || buffer.readUInt32BE(0) !== 0x504b0304) {
    throw new UnreadableFileError("This is not an Excel .xlsx file. Use the tariff template (Download template) and upload it as .xlsx.");
  }
  const unpacked = zipUnpackedBytes(buffer);
  if (unpacked === null) throw new UnreadableFileError("The file could not be opened as an Excel workbook. Open it in Excel, save it as .xlsx and try again.");
  if (unpacked > MAX_UNPACKED_BYTES) {
    throw new UnreadableFileError("The workbook unpacks to more than 50 MB. A tariff file is normally well under 1 MB: remove pictures or extra sheets and save it again.");
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as never);
  } catch {
    throw new UnreadableFileError("The file could not be opened as an Excel workbook. Open it in Excel, save it as .xlsx and try again.");
  }
  return wb.worksheets.map((ws) => {
    const rows: unknown[][] = [];
    const rowCount = Math.min(ws.rowCount, MAX_ROWS);
    const columnCount = Math.min(ws.columnCount, MAX_COLUMNS);
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const cells: unknown[] = [];
      for (let c = 1; c <= columnCount; c++) cells.push(cellValue(row.getCell(c)));
      rows.push(cells);
    }
    return { name: ws.name, rows };
  });
}

// ---- cell parsing (pure) ---------------------------------------------------------------------------

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const text = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : isBlank(v) ? "" : String(v).trim());

/**
 * A number from a cell: numbers as they are; text with a decimal comma or point ("12,5", "12.5"),
 * spaces as thousands separators ("1 250,50") and a currency or % sign. A single comma is a
 * decimal comma (the Czech way); several commas or dots are thousands separators. NaN when it is none.
 */
export function parseNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return NaN;
  const s = v
    .replace(/[\s  ]+/g, "")
    .replace(/(kč|czk|eur|€|%|kg)$/i, "")
    .replace(/^(kč|czk|eur|€)/i, "");
  if (!/^[-+]?[\d.,]*\d[\d.,]*$/.test(s)) return NaN;
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  let normal: string;
  if (commas && dots) {
    // both: the later one is the decimal mark
    const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normal = s.split(thousands).join("").replace(decimal, ".");
  } else if (commas) normal = commas === 1 ? s.replace(",", ".") : s.split(",").join("");
  else if (dots > 1) normal = s.split(".").join("");
  else normal = s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

/** A CZ postcode from "110 00", "11000" or the number 11000; null when it is none. */
export function parsePostcode(v: unknown): string | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 10000 && v <= 99999 ? String(v) : null;
  const digits = text(v).replace(/[\s  ]+/g, "");
  return /^\d{5}$/.test(digits) ? digits : null;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** YYYY-MM-DD from an Excel date, an Excel serial number, "2026-11-01" or "1. 11. 2026"; null when it is none. */
export function parseDate(v: unknown): string | null {
  let ymd: string | null = null;
  if (v instanceof Date) ymd = Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  else if (typeof v === "number") ymd = v > 0 && v < 2958466 ? new Date(EXCEL_EPOCH + Math.round(v) * 86400000).toISOString().slice(0, 10) : null;
  else if (typeof v === "string") {
    const s = v.trim();
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    const cz = /^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})$/.exec(s);
    if (iso) ymd = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    else if (cz) ymd = `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}`;
  }
  return ymd && isRealYmd(ymd) ? ymd : null;
}

/** Y / N / Ano / Ne / Yes / No / 1 / 0 / TRUE / FALSE; blank = false; null when it is none of them. */
export function parseYesNo(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  const s = text(v).toLowerCase();
  if (["", "n", "ne", "no", "false", "0"].includes(s)) return false;
  if (["y", "a", "ano", "yes", "true", "1"].includes(s)) return true;
  return null;
}

/** 0 → "A", 26 → "AA" */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---- parsing (pure) --------------------------------------------------------------------------------

export interface ParseDefaults {
  /** Chargeable weight factors from the Trucking settings, for empty Meta values */
  factors: TariffFactors;
  /** Prague today: stands in for a missing valid-from date (which is an error) */
  today: string;
}

export interface ParsedWorkbook {
  input: TariffVersionInput;
  /** Problems met while reading; the version's own findings come on top (lib/tariffValidation.ts) */
  findings: ValidationFinding[];
  sheets: ImportSheetReport[];
}

const KNOWN_SHEETS = [READ_ME, META, ZONES, ...SERVICE_LEVEL_CODES, SURCHARGES];

type MetaKey = "validFrom" | "validTo" | "kgPerLdm" | "kgPerCbm" | "kgPerPalletPlace" | "weightStepKg" | "moneyStep" | "notes";
const META_LABELS: Record<string, MetaKey> = {
  "valid from": "validFrom",
  "valid to": "validTo",
  "kg per ldm": "kgPerLdm",
  "kg per m³": "kgPerCbm",
  "kg per m3": "kgPerCbm",
  "kg per cbm": "kgPerCbm",
  "kg per pallet place": "kgPerPalletPlace",
  "weight step kg": "weightStepKg",
  "money step": "moneyStep",
  notes: "notes",
};

const fmtNumber = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Reads the tables of a filled tariff file into a version input, its problems and a report per sheet. */
export function parseTariffTables(tables: SheetTable[], defaults: ParseDefaults): ParsedWorkbook {
  const findings: ValidationFinding[] = [];
  const err = (message: string, where: string) => findings.push({ severity: "error", message, where });
  const warn = (message: string, where: string) => findings.push({ severity: "warning", message, where });
  const at = (sheet: string, row: number, col?: number) => `Sheet ${sheet}, row ${row + 1}${col === undefined ? "" : `, column ${columnLetter(col)}`}`;

  // Sheets by their standard name (any case, spaces around ignored); others are reported and ignored.
  const reports = new Map<SheetTable, ImportSheetReport>();
  const byName = new Map<string, SheetTable>();
  for (const t of tables) {
    const name = KNOWN_SHEETS.find((k) => k.toLowerCase() === t.name.trim().toLowerCase());
    if (!name) {
      warn(`Sheet ${t.name} was ignored`, `Sheet ${t.name}`);
      reports.set(t, { sheet: t.name, read: "ignored", rows: 0, note: "Not a sheet of the tariff template" });
    } else if (byName.has(name)) {
      warn(`Sheet ${t.name} was ignored: there is already a sheet ${name}`, `Sheet ${t.name}`);
      reports.set(t, { sheet: t.name, read: "ignored", rows: 0, note: `A second ${name} sheet` });
    } else {
      byName.set(name, t);
    }
  }
  const report = (name: string, rows: number, note: string) => reports.set(byName.get(name)!, { sheet: name, read: "used", rows, note });
  const missing: ImportSheetReport[] = [];
  const rowsOf = (name: string) => byName.get(name)?.rows ?? [];
  const headerRow = (rows: unknown[][], first: string) => rows.slice(0, HEADER_SEARCH_ROWS).findIndex((r) => text(r[0]).toLowerCase() === first);
  const isEmptyRow = (r: unknown[]) => r.every(isBlank);

  if (byName.has(READ_ME)) reports.set(byName.get(READ_ME)!, { sheet: READ_ME, read: "ignored", rows: 0, note: "Instructions, not read" });

  // ---- Meta
  const metaValues = new Map<MetaKey, { value: unknown; row: number }>();
  if (byName.has(META)) {
    rowsOf(META).forEach((r, i) => {
      const key = META_LABELS[text(r[0]).toLowerCase()];
      if (key && !metaValues.has(key)) metaValues.set(key, { value: r[1], row: i });
    });
    report(META, metaValues.size, "Validity, chargeable weight factors and rounding");
  } else {
    err("The Meta sheet is missing: valid from, the factors and the rounding could not be read", `Sheet ${META}`);
    missing.push({ sheet: META, read: "missing", rows: 0, note: "Defaults were used" });
  }
  const metaWhere = (key: MetaKey) => {
    const m = metaValues.get(key);
    return m ? at(META, m.row, 1) : `Sheet ${META}`;
  };
  const metaBlank = (key: MetaKey) => isBlank(metaValues.get(key)?.value);

  let validFrom = defaults.today;
  if (metaBlank("validFrom")) {
    if (byName.has(META)) err(`Valid from is empty; ${defaults.today} stands in until a file with the date is uploaded`, metaWhere("validFrom"));
  } else {
    const d = parseDate(metaValues.get("validFrom")!.value);
    if (d) validFrom = d;
    else err(`Valid from "${text(metaValues.get("validFrom")!.value)}" is not a date like 2026-11-01`, metaWhere("validFrom"));
  }
  let validTo: string | null = null;
  if (!metaBlank("validTo")) {
    validTo = parseDate(metaValues.get("validTo")!.value);
    if (!validTo) err(`Valid to "${text(metaValues.get("validTo")!.value)}" is not a date like 2026-12-31`, metaWhere("validTo"));
  }
  const metaNumber = (key: MetaKey, label: string, fallback: number, fallbackFrom: string): number => {
    if (metaBlank(key)) {
      if (byName.has(META)) warn(`${label} is empty: ${fmtNumber(fallback)}${fallbackFrom} was used`, metaWhere(key));
      return fallback;
    }
    const raw = metaValues.get(key)!.value;
    const n = parseNumber(raw);
    if (Number.isNaN(n) || n <= 0) {
      err(`${label} "${text(raw)}" is not a number above 0; ${fmtNumber(fallback)} stands in`, metaWhere(key));
      return fallback;
    }
    return n;
  };
  const fromSettings = " from the Trucking settings";
  const factors: TariffFactors = {
    kgPerLdm: metaNumber("kgPerLdm", "kg per LDM", defaults.factors.kgPerLdm, fromSettings),
    kgPerCbm: metaNumber("kgPerCbm", "kg per m³", defaults.factors.kgPerCbm, fromSettings),
    kgPerPalletPlace: metaNumber("kgPerPalletPlace", "kg per pallet place", defaults.factors.kgPerPalletPlace, fromSettings),
  };
  const rounding = {
    weightStepKg: metaNumber("weightStepKg", "Weight step kg", 1, ""),
    moneyStep: metaNumber("moneyStep", "Money step", 0.01, ""),
  };
  const notes = text(metaValues.get("notes")?.value);

  // ---- Zones
  const zones: TariffZone[] = [];
  const rejectedZones = new Set<string>();
  if (byName.has(ZONES)) {
    const rows = rowsOf(ZONES);
    const h = headerRow(rows, "zone code");
    if (h < 0) {
      err("No header row Zone code | Label | PSČ from | PSČ to | Remote: no zones were read", `Sheet ${ZONES}`);
    } else {
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i];
        if (isEmptyRow(r)) continue;
        const code = text(r[0]);
        if (!code) {
          err("The zone code is empty: the row was skipped", at(ZONES, i, 0));
          continue;
        }
        if (zones.some((z) => z.code === code) || rejectedZones.has(code)) {
          err(`Zone code ${code} is used twice: this row was skipped`, at(ZONES, i, 0));
          continue;
        }
        const from = parsePostcode(r[2]);
        const to = parsePostcode(r[3]);
        const remote = parseYesNo(r[4]);
        let ok = true;
        if (!from) {
          err(`PSČ from "${text(r[2])}" is not a postcode like 110 00: zone ${code} was skipped`, at(ZONES, i, 2));
          ok = false;
        }
        if (!to) {
          err(`PSČ to "${text(r[3])}" is not a postcode like 110 00: zone ${code} was skipped`, at(ZONES, i, 3));
          ok = false;
        }
        if (remote === null) err(`Remote "${text(r[4])}" must be Y or N; N was used`, at(ZONES, i, 4));
        if (!ok) {
          rejectedZones.add(code);
          continue;
        }
        zones.push({ code, label: text(r[1]), postcodeFrom: from!, postcodeTo: to!, remote: remote ?? false });
      }
    }
    report(ZONES, zones.length, `${zones.length} zone${zones.length === 1 ? "" : "s"}`);
  } else {
    err("The Zones sheet is missing: no zones were read", `Sheet ${ZONES}`);
    missing.push({ sheet: ZONES, read: "missing", rows: 0, note: "No zones" });
  }
  const zoneCodes = new Set(zones.map((z) => z.code));

  // ---- level sheets
  const bands: TariffBand[] = [];
  const bandSheet = new Map<string, ServiceLevelCode>();
  const rates: TariffRate[] = [];
  const minCharges: TariffVersionInput["minCharges"] = [];
  const levelSheets = SERVICE_LEVEL_CODES.filter((c) => byName.has(c));
  const describe = (basis: BandBasis, fromExcl: number, toIncl: number | null) => bandLabel({ id: "", basis, fromExcl, toIncl });

  for (const t of tables) {
    const level = SERVICE_LEVEL_CODES.find((c) => byName.get(c) === t);
    if (!level) continue;
    const rows = t.rows;
    const h = headerRow(rows, "basis");
    if (h < 0) {
      err("No header row Basis | From (excl.) | To (incl.) | Price type | zones…: the sheet was not read", `Sheet ${level}`);
      report(level, 0, "Not read");
      continue;
    }
    // zone columns: from E on, by the header
    const columns: { col: number; zone: string }[] = [];
    const header = rows[h];
    for (let c = 4; c < header.length; c++) {
      const code = text(header[c]);
      if (!code) continue;
      if (columns.some((x) => x.zone === code)) err(`Zone ${code} has a second column: it was skipped`, at(level, h, c));
      else if (!zoneCodes.has(code)) {
        if (!rejectedZones.has(code)) err(`Zone ${code} is not on the Zones sheet: its column was skipped`, at(level, h, c));
      } else columns.push({ col: c, zone: code });
    }

    let bandRows = 0;
    let prices = 0;
    let minRead = false;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i];
      if (isEmptyRow(r)) continue;
      const basisText = text(r[0]).toUpperCase();
      const amounts = (onAmount: (zone: string, amount: number) => void) => {
        for (const { col, zone } of columns) {
          const v = r[col];
          if (isBlank(v) || text(v) === "-" || text(v) === "–") continue;
          const n = parseNumber(v);
          if (Number.isNaN(n)) err(`"${text(v)}" is not a number`, at(level, i, col));
          else onAmount(zone, n);
        }
      };
      if (basisText === "MIN") {
        if (minRead) {
          err("A second MIN row: it was skipped", at(level, i, 0));
          continue;
        }
        minRead = true;
        amounts((zoneCode, amount) => minCharges.push({ serviceLevel: level, zoneCode, amount }));
        continue;
      }
      const basis = BASES.find((b) => b === basisText);
      if (!basis) {
        err(`Basis "${text(r[0])}" must be KG, PALLET, LDM, TRIP or MIN: the row was skipped`, at(level, i, 0));
        continue;
      }
      const from = isBlank(r[1]) && basis === "TRIP" ? 0 : parseNumber(r[1]);
      if (Number.isNaN(from)) {
        err(isBlank(r[1]) ? "From (excl.) is empty: the row was skipped" : `From (excl.) "${text(r[1])}" is not a number: the row was skipped`, at(level, i, 1));
        continue;
      }
      const to = isBlank(r[2]) ? null : parseNumber(r[2]);
      if (to !== null && Number.isNaN(to)) {
        err(`To (incl.) "${text(r[2])}" is not a number: the row was skipped`, at(level, i, 2));
        continue;
      }
      const priceType = PRICE_TYPES.find((p) => p === text(r[3]).toUpperCase());
      if (!priceType) {
        err(`Price type "${text(r[3])}" must be FLAT, PER_UNIT or PER_100KG: the row was skipped`, at(level, i, 3));
        continue;
      }
      // the same Basis / From / To on any sheet is the same band; a band that crosses one of another sheet is refused
      let band = bands.find((b) => b.basis === basis && b.fromExcl === from && b.toIncl === to);
      if (!band) {
        const crossing = bands.find(
          (b) => b.basis === basis && bandSheet.get(b.id) !== level && b.fromExcl < (to ?? Infinity) && from < (b.toIncl ?? Infinity),
        );
        if (crossing) {
          err(
            `Band ${describe(basis, from, to)} overlaps band ${describe(basis, crossing.fromExcl, crossing.toIncl)} of sheet ${bandSheet.get(crossing.id)}: use the same bands on every sheet. The row was skipped`,
            at(level, i, 1),
          );
          continue;
        }
        band = { id: `b${bands.length + 1}`, basis, fromExcl: from, toIncl: to };
        bands.push(band);
        bandSheet.set(band.id, level);
      }
      bandRows++;
      const bandId = band.id;
      amounts((zoneCode, amount) => {
        rates.push({ serviceLevel: level, zoneCode, bandId, amount, priceType });
        prices++;
      });
    }
    report(level, bandRows + (minRead ? 1 : 0), prices ? `${bandRows} band${bandRows === 1 ? "" : "s"}, ${prices} prices` : "No prices: the level is not offered");
  }
  if (!levelSheets.length) err("There is no price sheet (D1, D2, D3, D4, EXP_SAMEDAY, EXP_1000, EXP_1200 or EXP_FIXED)", "Workbook");
  else if (!rates.length) err("The file has no prices: every price sheet is empty", "Workbook");

  // ---- Surcharges
  const surcharges: TariffSurcharge[] = [];
  if (byName.has(SURCHARGES)) {
    const rows = rowsOf(SURCHARGES);
    const h = headerRow(rows, "code");
    if (h < 0) err("No header row Code | Calculation | Value | Minimum | On freight + surcharges: no surcharges were read", `Sheet ${SURCHARGES}`);
    else {
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i];
        if (isEmptyRow(r)) continue;
        const code = SURCHARGE_CODES.find((c) => c === text(r[0]).toUpperCase());
        if (!code) {
          err(`Code "${text(r[0])}" is not a surcharge code (${SURCHARGE_CODES.join(", ")}): the row was skipped`, at(SURCHARGES, i, 0));
          continue;
        }
        const calc = SURCHARGE_CALCS.find((c) => c === text(r[1]).toUpperCase());
        if (!calc) {
          err(`Calculation "${text(r[1])}" must be ${SURCHARGE_CALCS.join(", ")}: the row was skipped`, at(SURCHARGES, i, 1));
          continue;
        }
        const value = isBlank(r[2]) && calc === "FUEL_INDEX" ? 0 : parseNumber(r[2]);
        if (Number.isNaN(value)) {
          err(isBlank(r[2]) ? `The value of ${code} is empty: the row was skipped` : `Value "${text(r[2])}" is not a number: the row was skipped`, at(SURCHARGES, i, 2));
          continue;
        }
        const min = isBlank(r[3]) ? null : parseNumber(r[3]);
        if (min !== null && Number.isNaN(min)) {
          err(`Minimum "${text(r[3])}" is not a number: the row was skipped`, at(SURCHARGES, i, 3));
          continue;
        }
        const onBase = parseYesNo(r[4]);
        if (onBase === null) err(`"${text(r[4])}" must be Y or N; N was used`, at(SURCHARGES, i, 4));
        surcharges.push({ code, calc, value, min, onBasePlusSurcharges: onBase ?? false });
      }
    }
    report(SURCHARGES, surcharges.length, `${surcharges.length} surcharge${surcharges.length === 1 ? "" : "s"}`);
  } else {
    warn("There is no Surcharges sheet: the version has no surcharges", `Sheet ${SURCHARGES}`);
    missing.push({ sheet: SURCHARGES, read: "missing", rows: 0, note: "No surcharges" });
  }

  return {
    input: { validFrom, validTo, factors, rounding, zones, bands, rates, minCharges, surcharges, notes },
    findings,
    sheets: [...tables.map((t) => reports.get(t)!), ...missing],
  };
}

/** Loads and parses a filled tariff file; throws UnreadableFileError when it is not one at all. */
export async function readTariffWorkbook(buffer: Buffer, defaults: ParseDefaults): Promise<ParsedWorkbook> {
  return parseTariffTables(await loadWorkbookTables(buffer), defaults);
}
