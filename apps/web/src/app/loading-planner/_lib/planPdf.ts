import { jsPDF } from "jspdf";
import { BALANCE_TOLERANCE_PCT } from "./balance";
import { fitLabel, gaugeOf, type CargoLine } from "./gauge";
import { END_WALLS_NOTE, floorOverloadText, hasDoors, lineColour, loadStats, planTotals, type PieceGroup } from "./loadStats";
import type { ContainerLoad, LoadPlan } from "./plan";
import { formatDim, formatKg, formatSize, type DimUnit } from "./units";

// The loading plan as a PDF to send to a customer, an agent or a warehouse: a summary page with the
// cargo list, then a page per container with its floor drawn from above to scale, its figures and
// its pieces. A4 landscape, because a container is long. Everything is drawn as lines and text, so
// it prints sharp at any size.

export interface PlanPdfInput {
  name: string;
  /** The job the plan is linked to, as "Shipment CZ00000053"; empty for a what-if plan. */
  job: string;
  /** The company the plan is made in, and who made the PDF; empty when not known. */
  company?: string;
  madeBy?: string;
  /** The planned cargo lines, in the order of the screen. */
  lines: CargoLine[];
  /** The number a cargo line carries in the cargo table of the screen; by default its place in `lines`. */
  numberOf?: (lineId: string) => number;
  plan: LoadPlan;
  /** The names of the nominated container types; null when the planner chose. */
  nominated: string[] | null;
  unit: DimUnit;
  /** Typed cargo lines left out of the plan because a figure is missing. */
  unplanned?: number;
  /** False when the plan on screen has changes that are not saved. */
  saved?: boolean;
  /** The day the PDF is made, as the app writes dates. */
  printedOn: string;
}

/** The font files of a face that has Czech, Polish, Greek and Cyrillic letters, as base64. */
export interface PdfFonts {
  regular: string;
  bold: string;
}

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;
const WIDTH = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 16;

// Slate, red, amber, emerald and indigo of the app's palette.
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const RULE = "#cbd5e1";
const RED = "#dc2626";
const AMBER = "#b45309";
const GREEN = "#059669";
const INDIGO = "#4f46e5";

const UNICODE_FACE = "DejaVuSans";
// The face in use: jsPDF's own Helvetica, or the embedded one. A document is built in one go, so
// this is set once at its start.
let face = "helvetica";

// What the embedded face prints: Latin with its extensions, Greek, Cyrillic, punctuation, arrows and
// maths signs. Anything else (Chinese, Arabic, emoji) prints as "?" rather than as garbage.
const outsideFace = /[^ -ɏͰ-ԯḀ-ỿ -⁯₠-₿←-⇿∀-⋿]/gu;
// Helvetica as jsPDF carries it has Western European letters only: other accents lose their mark,
// dashes and quotes become plain ones, the rest prints as "?".
const toHelvetica = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^ -~ -ÿ]/g, "?");
const clean = (v: string) => (face === UNICODE_FACE ? v.replace(/\s/g, " ").replace(outsideFace, "?") : toHelvetica(v.replace(/\s/g, " ")));

const setFont = (doc: jsPDF, style: "normal" | "bold", size: number, colour: string) => {
  doc.setFont(face, style);
  doc.setFontSize(size);
  doc.setTextColor(colour);
};

/** Cuts a text to the width it has. */
function fit(doc: jsPDF, text: string, maxWidth: number): string {
  const value = clean(text);
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let t = value;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

const pctText = (value: number) => `${Math.round(value)}%`;
const offText = (value: number) => `${Math.abs(value) < 0.5 ? "0" : Math.abs(value).toFixed(0)}%`;
/** "5,000 × 3,000 × 2,000": the unit stands in the column's head. */
const sizeText = (l: number, w: number, h: number, unit: DimUnit) => formatSize(l, w, h, unit).replace(` ${unit}`, "");

function label(doc: jsPDF, text: string, x: number, y: number) {
  setFont(doc, "bold", 7, MUTED);
  doc.text(clean(text.toUpperCase()), x, y);
}

function value(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, colour = INK) {
  setFont(doc, "bold", 10, colour);
  doc.text(fit(doc, text, maxWidth), x, y);
}

/** A text over as many lines as it needs, carried to a new page when the page is full; returns the y below it. */
function paragraph(doc: jsPDF, text: string, y: number, style: "normal" | "bold", colour: string, newPage: () => number): number {
  setFont(doc, style, 9, colour);
  for (const row of doc.splitTextToSize(clean(text), WIDTH) as string[]) {
    if (y > BOTTOM) {
      y = newPage();
      setFont(doc, style, 9, colour);
    }
    doc.text(row, MARGIN, y);
    y += 4.5;
  }
  return y + 1;
}

interface Column {
  title: string;
  width: number;
  right?: boolean;
}

/** A plain table's head row; returns the y of the first body row. */
function tableHead(doc: jsPDF, columns: Column[], y: number): number {
  let x = MARGIN;
  for (const column of columns) {
    setFont(doc, "bold", 7, MUTED);
    doc.text(clean(column.title.toUpperCase()), column.right ? x + column.width - 2 : x, y, { align: column.right ? "right" : "left" });
    x += column.width;
  }
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + 1.5, MARGIN + WIDTH, y + 1.5);
  return y + 6;
}

/** One body row. A cell is its text, or a colour swatch followed by its text. */
function tableRow(doc: jsPDF, columns: Column[], cells: (string | { swatch: string; text: string })[], y: number) {
  let x = MARGIN;
  setFont(doc, "normal", 9, BODY);
  columns.forEach((column, index) => {
    const cell = cells[index] ?? "";
    if (typeof cell === "string") {
      doc.text(fit(doc, cell, column.width - 2), column.right ? x + column.width - 2 : x, y, { align: column.right ? "right" : "left" });
    } else {
      doc.setFillColor(cell.swatch);
      doc.setDrawColor(BODY);
      doc.setLineWidth(0.15);
      doc.rect(x, y - 2.6, 3, 3, "FD");
      doc.text(fit(doc, cell.text, column.width - 7), x + 5, y);
    }
    x += column.width;
  });
}

function pageHead(doc: jsPDF, title: string, input: PlanPdfInput) {
  setFont(doc, "bold", 16, INK);
  doc.text(fit(doc, title, WIDTH * 0.6), MARGIN, MARGIN + 6);
  setFont(doc, "normal", 9, MUTED);
  const right = [input.name, input.job].filter(Boolean).join(" · ");
  doc.text(fit(doc, right, WIDTH * 0.38), MARGIN + WIDTH, MARGIN + 6, { align: "right" });
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, MARGIN + 9, MARGIN + WIDTH, MARGIN + 9);
}

/** "653 mm over the sides" for a row whose pieces stick out. */
function overText(group: PieceGroup, unit: DimUnit): string {
  return [
    group.over.length > 0 && `${formatDim(group.over.length, unit)} ${unit} over the ends`,
    group.over.width > 0 && `${formatDim(group.over.width, unit)} ${unit} over the sides`,
    group.over.height > 0 && `${formatDim(group.over.height, unit)} ${unit} over the top`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** What the loader needs to know about a row: how it lies, how high it stands, where it starts, what sticks out. */
function notesOf(group: PieceGroup, unit: DimUnit): string {
  return [
    group.crosswise && "crosswise",
    group.stacked > 0 && `${group.stacked} stacked, top at ${formatDim(group.topMm, unit)} ${unit}`,
    group.count === 1 && `${formatDim(group.at.fromFront, unit)} ${unit} from the front wall`,
    overText(group, unit),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The floor of a container from above, to scale, in a box `maxHeight` high at most; returns the height used. */
function drawFloor(doc: jsPDF, load: ContainerLoad, colourOf: (lineId: string) => string, numberOf: (lineId: string) => number, top: number, maxHeight: number): number {
  const { container, pieces } = load;
  const doors = hasDoors(container);
  const onFloor = pieces.filter((piece) => piece.y === 0);
  const minZ = Math.min(0, ...onFloor.map((p) => p.z));
  const maxZ = Math.max(container.internalL, ...onFloor.map((p) => p.z + p.length));
  const minX = Math.min(0, ...onFloor.map((p) => p.x));
  const maxX = Math.max(container.internalW, ...onFloor.map((p) => p.x + p.width));
  // The names of the two ends stand beside the drawing.
  const side = 7;
  const scale = Math.min((WIDTH - side * 2) / (maxZ - minZ), maxHeight / (maxX - minX));
  // The drawing is centred across the page.
  const left = MARGIN + (WIDTH - (maxZ - minZ) * scale) / 2;
  const px = (z: number) => left + (z - minZ) * scale;
  const py = (x: number) => top + (x - minX) * scale;

  doc.setFillColor("#f8fafc");
  doc.setDrawColor(MUTED);
  doc.setLineWidth(0.4);
  doc.rect(px(0), py(0), container.internalL * scale, container.internalW * scale, "FD");

  for (const piece of onFloor) {
    doc.setFillColor(colourOf(piece.lineId));
    doc.setDrawColor(BODY);
    doc.setLineWidth(0.2);
    const [w, h] = [piece.length * scale, piece.width * scale];
    doc.rect(px(piece.z), py(piece.x), w, h, "FD");
    // The number of the cargo line, and how many high a stack is: the colours alone do not print in black and white.
    const high = pieces.filter((p) => p.x === piece.x && p.z === piece.z).length;
    const text = clean(`${numberOf(piece.lineId)}${high > 1 ? ` ×${high}` : ""}`);
    const size = Math.min(11, h * 1.6, (w / text.length) * 3.6);
    if (size >= 3) {
      setFont(doc, "bold", size, INK);
      doc.text(text, px(piece.z + piece.length / 2), py(piece.x + piece.width / 2), { align: "center", baseline: "middle" });
    }
  }

  // The two ends by name: the door end is drawn heavy.
  const midY = py(container.internalW / 2);
  // A turned text reads upwards from its starting point, so it starts half its length below the middle.
  const endName = (text: string, x: number, colour: string) => {
    setFont(doc, "bold", 7, colour);
    doc.text(text, x, midY + doc.getTextWidth(text) / 2, { angle: 90 });
  };
  endName(doors ? "FRONT WALL" : "END WALL", px(minZ) - 2, MUTED);
  if (doors) {
    doc.setDrawColor(INDIGO);
    doc.setLineWidth(1.2);
    doc.line(px(container.internalL), py(0), px(container.internalL), py(container.internalW));
    endName("DOORS", px(maxZ) + 5, INDIGO);
  } else {
    endName("END WALL", px(maxZ) + 5, MUTED);
  }

  // The middle of the floor (a cross) and the centre of gravity (a dot).
  const stats = loadStats(load);
  const midX = px(container.internalL / 2);
  doc.setDrawColor(INK);
  doc.setLineWidth(0.3);
  doc.line(midX - 2.5, midY, midX + 2.5, midY);
  doc.line(midX, midY - 2.5, midX, midY + 2.5);
  doc.setFillColor(stats.balance.ok ? GREEN : RED);
  doc.setDrawColor("#ffffff");
  doc.setLineWidth(0.25);
  doc.circle(px(stats.balance.cogZ), py(stats.balance.cogX), 1.3, "FD");

  return (maxX - minX) * scale;
}

function summaryPage(doc: jsPDF, input: PlanPdfInput, colourOf: (lineId: string) => string, numberOf: (lineId: string) => number) {
  const { plan, unit } = input;
  const totals = planTotals(plan);
  pageHead(doc, "Loading plan", input);

  let y = MARGIN + 15;
  // Who the plan comes from, and what it is: a calculation, not a stowage instruction.
  const madeBy = [input.company, input.madeBy && `made by ${input.madeBy}`, `on ${input.printedOn}`].filter(Boolean).join(", ");
  setFont(doc, "normal", 9, BODY);
  doc.text(fit(doc, `${madeBy.charAt(0).toUpperCase()}${madeBy.slice(1)}. Sizes in ${unit}, weights in kg.${input.saved === false ? " Draft: the plan has changes that are not saved." : ""}`, WIDTH), MARGIN, y);
  y += 4.5;
  setFont(doc, "normal", 9, MUTED);
  doc.text(fit(doc, "A calculated proposal. Check the lashing, the real sizes and weights, and the carrier's limits before loading.", WIDTH), MARGIN, y);
  y += 8;

  const quarter = WIDTH / 4;
  const figures: [string, string, string?][] = [
    ["Containers", `${plan.loads.length}${totals.equipment.length > 0 ? `  (${totals.equipment.map((e) => `${e.count} × ${e.name}`).join(", ")})` : ""}`],
    ["Colli loaded", `${totals.pieces}${totals.notLoaded > 0 ? `  (${totals.notLoaded} not loaded)` : ""}`, totals.notLoaded > 0 ? RED : undefined],
    ["Weight loaded", formatKg(totals.weightKg)],
    ["Balanced", `${totals.balanced} of ${plan.loads.length} within ${BALANCE_TOLERANCE_PCT}% of the middle`, totals.balanced < plan.loads.length ? RED : undefined],
  ];
  figures.forEach(([title, text, colour], index) => {
    label(doc, title, MARGIN + quarter * index, y);
    value(doc, text, MARGIN + quarter * index, y + 5, quarter - 4, colour);
  });
  y += 12;

  const newPage = () => {
    doc.addPage();
    pageHead(doc, "Loading plan (continued)", input);
    return MARGIN + 17;
  };
  const equipment = input.nominated
    ? `Equipment nominated: ${input.nominated.join(", ") || "none"}.`
    : "Equipment chosen by the planner: standard containers first, open tops for over-height, flat racks last.";
  y = paragraph(doc, equipment, y, "normal", BODY, newPage);
  if (input.unplanned) {
    const text = `${input.unplanned === 1 ? "1 cargo line is" : `${input.unplanned} cargo lines are`} not in this plan: a size, the weight or the colli was missing when it was made.`;
    y = paragraph(doc, text, y, "bold", AMBER, newPage);
  }
  y += 2;

  if (plan.notLoaded.length > 0) {
    setFont(doc, "bold", 9, RED);
    doc.text("NOT LOADED", MARGIN, y);
    y += 5;
    for (const entry of plan.notLoaded) {
      y = paragraph(doc, `${numberOf(entry.lineId)} · ${entry.colli} × ${entry.name || "Cargo"}: ${entry.reason}`, y, "normal", RED, newPage);
    }
    y += 3;
  }

  const columns: Column[] = [
    { title: "No.", width: 12 },
    { title: "Cargo", width: 62 },
    { title: `L × W × H (${unit})`, width: 54 },
    { title: "Weight / pc", width: 28, right: true },
    { title: "Colli", width: 16, right: true },
    { title: "Total weight", width: 32, right: true },
    { title: "Stackable", width: 22 },
    { title: "Standard container", width: 47 },
  ];
  if (y > BOTTOM - 12) y = newPage();
  y = tableHead(doc, columns, y);
  for (const line of input.lines) {
    if (y > BOTTOM) {
      doc.addPage();
      pageHead(doc, "Loading plan: cargo", input);
      y = tableHead(doc, columns, MARGIN + 17);
    }
    tableRow(
      doc,
      columns,
      [
        String(numberOf(line.id)),
        { swatch: colourOf(line.id), text: `${line.name || "Cargo"}${line.dg ? " (DG)" : ""}` },
        sizeText(line.lengthMm, line.widthMm, line.heightMm, unit),
        formatKg(line.weightKg),
        String(line.colli),
        formatKg(line.weightKg * line.colli),
        line.stackable ? "Yes" : "No",
        fitLabel(gaugeOf(line)),
      ],
      y,
    );
    y += 5.5;
  }
}

function loadPage(doc: jsPDF, input: PlanPdfInput, load: ContainerLoad, number: number, colourOf: (lineId: string) => string, numberOf: (lineId: string) => number) {
  const { unit } = input;
  const { container } = load;
  const stats = loadStats(load);
  const title = `#${number} of ${input.plan.loads.length} · ${container.name}`;
  pageHead(doc, title, input);

  let y = MARGIN + 14;
  y += drawFloor(doc, load, colourOf, numberOf, y, 60) + 8;

  // Six figures in one row, each as wide as it needs.
  const widths = [20, 50, 26, 34, 88, 55];
  const { balance } = stats;
  const figures: [string, string, string?][] = [
    ["Colli", String(stats.pieceCount)],
    ["Weight (of payload)", `${formatKg(load.totalWeightKg)}  (${pctText(stats.payloadPct)})`],
    ["Floor used", pctText(stats.floorPct)],
    ["Highest point", `${formatDim(stats.topMm, unit)} ${unit}`],
    ["Centre of gravity", `${offText(balance.alongPct)} off lengthwise, ${offText(balance.acrossPct)} off sideways`, balance.ok ? undefined : RED],
    ["Check", [balance.ok ? "Balanced" : "OUT OF BALANCE", stats.outOfGauge ? "Out of gauge" : ""].filter(Boolean).join(" · "), balance.ok ? (stats.outOfGauge ? AMBER : GREEN) : RED],
  ];
  let x = MARGIN;
  figures.forEach(([name, text, colour], index) => {
    label(doc, name, x, y);
    value(doc, text, x, y + 5, (widths[index] ?? 40) - 3, colour);
    x += widths[index] ?? 40;
  });
  y += 13;

  const columns: Column[] = [
    { title: "No.", width: 12 },
    { title: "Cargo", width: 68 },
    { title: "Colli", width: 16, right: true },
    { title: `Loaded as L × W × H (${unit})`, width: 58 },
    { title: "Weight / pc", width: 28, right: true },
    { title: "Notes", width: 91 },
  ];
  const newPage = () => {
    doc.addPage();
    pageHead(doc, `${title} (continued)`, input);
    return MARGIN + 17;
  };
  y = tableHead(doc, columns, y);
  for (const group of stats.groups) {
    if (y > BOTTOM) y = tableHead(doc, columns, newPage());
    tableRow(
      doc,
      columns,
      [
        String(numberOf(group.lineId)),
        { swatch: colourOf(group.lineId), text: group.name || "Cargo" },
        String(group.count),
        sizeText(group.length, group.width, group.height, unit),
        formatKg(group.weightKg),
        notesOf(group, unit),
      ],
      y,
    );
    y += 5.5;
  }

  // Every warning in full, over as many lines and pages as it needs.
  y += 2;
  if (stats.endWallsFolded) y = paragraph(doc, END_WALLS_NOTE, y, "bold", AMBER, newPage);
  for (const overload of stats.floorOverloads) y = paragraph(doc, floorOverloadText(overload, container, unit), y, "bold", AMBER, newPage);
  if (!balance.ok) {
    const text = `The centre of gravity is more than ${BALANCE_TOLERANCE_PCT}% off the middle of the floor, and the planner found no better arrangement. Spread the weight over more containers or change the equipment.`;
    y = paragraph(doc, text, y, "bold", RED, newPage);
  }
  if (!hasDoors(container)) paragraph(doc, "A flat rack has no doors: positions are measured from the end wall on the left.", y, "normal", MUTED, newPage);
}

/**
 * The plan as a PDF document: the summary, then a page (or more, for a long piece list) per
 * container. With `fonts` the text is set in a face that has Czech and other accented letters;
 * without, in the PDF's own Helvetica, with the accents taken off.
 */
export function buildPlanPdf(input: PlanPdfInput, fonts?: PdfFonts): jsPDF {
  const numberOf = input.numberOf ?? ((lineId: string) => input.lines.findIndex((line) => line.id === lineId) + 1);
  const colourOf = (lineId: string) => lineColour(numberOf(lineId) - 1).hex;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  face = "helvetica";
  if (fonts) {
    doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
    doc.addFont("DejaVuSans.ttf", UNICODE_FACE, "normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
    doc.addFont("DejaVuSans-Bold.ttf", UNICODE_FACE, "bold");
    face = UNICODE_FACE;
  }
  doc.setProperties({ title: toHelvetica(`Loading plan - ${input.name}`) });

  summaryPage(doc, input, colourOf, numberOf);
  const summaryPages = doc.getNumberOfPages();
  input.plan.loads.forEach((load, index) => {
    doc.addPage();
    loadPage(doc, input, load, index + 1, colourOf, numberOf);
  });

  // The foot of every page, once the number of pages is known. How to read a floor plan stands only under one.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    setFont(doc, "normal", 7.5, MUTED);
    if (page > summaryPages) {
      doc.text(
        clean("Seen from above, to scale. A piece carries the number of its cargo line; “×2” means two high. The cross is the middle of the floor, the dot the centre of gravity."),
        MARGIN,
        PAGE_H - 8,
      );
    }
    doc.text(`Page ${page} of ${pages}`, MARGIN + WIDTH, PAGE_H - 8, { align: "right" });
  }
  return doc;
}

/** The file name of a plan's PDF: its name with only letters, digits, spaces, dashes and underscores kept. */
export const planPdfFileName = (name: string): string =>
  `${name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Loading plan"}.pdf`;

async function fontFile(path: string): Promise<string> {
  const reply = await fetch(path);
  if (!reply.ok) throw new Error(`Font ${path}: ${reply.status}`);
  const bytes = new Uint8Array(await reply.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

// The font files are fetched once per visit, on the first PDF.
let fontsOnce: Promise<PdfFonts | undefined> | null = null;
const loadFonts = (): Promise<PdfFonts | undefined> => {
  fontsOnce ??= Promise.all([fontFile("/fonts/DejaVuSans.ttf"), fontFile("/fonts/DejaVuSans-Bold.ttf")]).then(
    ([regular, bold]) => ({ regular, bold }),
    () => {
      // Without the font files the PDF is still made, in Helvetica; the next PDF tries again.
      fontsOnce = null;
      return undefined;
    },
  );
  return fontsOnce;
};

/** Makes the plan's PDF in the browser and hands it to the user as a download. */
export async function downloadPlanPdf(input: PlanPdfInput): Promise<void> {
  buildPlanPdf(input, await loadFonts()).save(planPdfFileName(input.name));
}
