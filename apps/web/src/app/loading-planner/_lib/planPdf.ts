import { jsPDF } from "jspdf";
import { NO_CLEARANCE, type ContainerSpec, type PlanRules } from "./containers";
import { dgWarning, dgWords, isDangerous, lashingNotes } from "./dangerous";
import { standardLabel, type CargoLine } from "./gauge";
import { balanceLimitText, END_WALLS_NOTE, floorOverloadText, outOfBalanceText, ruleWarnings, hasDoors, lineColour, loadStats, planTotals, startText, type PieceGroup } from "./loadStats";
import type { ContainerLoad, LoadPlan } from "./plan";
import { floorStepNumbers, howText, loadingRuns, stepsText, whereText } from "./stuffing";
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
  /** The place in the palette a cargo line is drawn in; by default its number, as on the screen. A sailing's box is coloured by shipment. */
  colourIndexOf?: (lineId: string) => number;
  plan: LoadPlan;
  /** The names of the nominated container types; null when the planner chose. */
  nominated: string[] | null;
  unit: DimUnit;
  /** The company's rules the plan was worked out with; none when left out. */
  rules?: PlanRules;
  /** A 45' is nominated: "fits a standard container" is then judged against its length. */
  with45?: boolean;
  /** Typed cargo lines left out of the plan because a figure is missing. */
  unplanned?: number;
  /** The plan's free note for the stuffing gang; printed on the first page. */
  note?: string;
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
function notesOf(group: PieceGroup, container: ContainerSpec, unit: DimUnit): string {
  return [
    group.crosswise && "crosswise",
    group.stacked > 0 && `${group.stacked} stacked, top at ${formatDim(group.topMm, unit)} ${unit}`,
    group.count === 1 && startText(group, container, unit),
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
    doc.rect(px(piece.z), py(piece.x), piece.length * scale, piece.width * scale, "FD");
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
  const cog = [px(stats.balance.cogZ), py(stats.balance.cogX)] as const;
  doc.setDrawColor(INK);
  doc.setLineWidth(0.3);
  doc.line(midX - 2.5, midY, midX + 2.5, midY);
  doc.line(midX, midY - 2.5, midX, midY + 2.5);
  doc.setFillColor(stats.balance.ok ? GREEN : RED);
  doc.setDrawColor("#ffffff");
  doc.setLineWidth(0.25);
  doc.circle(cog[0], cog[1], 1.3, "FD");

  // The number of the cargo line on each piece, and how many high a stack is: the colours alone do
  // not print in black and white. A number the cross or the dot would cover moves along its piece.
  const marks = [[midX, midY, 2.5], [cog[0], cog[1], 1.3]] as const;
  const clear = (x: number, y: number, w: number, h: number) => marks.every(([mx, my, r]) => Math.abs(mx - x) > w / 2 + r || Math.abs(my - y) > h / 2 + r);
  for (const piece of onFloor) {
    const [w, h] = [piece.length * scale, piece.width * scale];
    const high = pieces.filter((p) => p.x === piece.x && p.z === piece.z).length;
    const text = clean(`${numberOf(piece.lineId)}${high > 1 ? ` ×${high}` : ""}`);
    const size = Math.min(11, h * 1.6, (w / text.length) * 3.6);
    if (size < 3) continue;
    setFont(doc, "bold", size, INK);
    const [textW, textH] = [doc.getTextWidth(text), size * 0.35];
    const y = py(piece.x + piece.width / 2);
    const x = [1 / 2, 1 / 4, 3 / 4].map((share) => px(piece.z + piece.length * share)).find((at) => clear(at, y, textW, textH)) ?? px(piece.z + piece.length / 2);
    doc.text(text, x, y, { align: "center", baseline: "middle" });
  }

  // The loading step of each piece on the floor, small, in its corner at the far end: the order to
  // load in (the stuffing sheet below). Left out where a piece is too small to carry it.
  const stepOf = floorStepNumbers(load);
  for (const piece of onFloor) {
    const step = stepOf.get(`${piece.x}|${piece.z}`);
    const [w, h] = [piece.length * scale, piece.width * scale];
    if (step === undefined || w < 6 || h < 4.5) continue;
    setFont(doc, "normal", 5.5, BODY);
    doc.text(`s${step}`, px(piece.z) + 0.8, py(piece.x) + 2.3);
  }

  return (maxX - minX) * scale;
}

/**
 * The container from its side, to scale, in a box `maxHeight` high at most: only drawn for a load
 * with pieces standing on others, so the stacks are seen and not only counted. Returns the height used.
 */
function drawSide(doc: jsPDF, load: ContainerLoad, colourOf: (lineId: string) => string, top: number, maxHeight: number): number {
  const { container, pieces } = load;
  const maxZ = Math.max(container.internalL, ...pieces.map((p) => p.z + p.length));
  const minZ = Math.min(0, ...pieces.map((p) => p.z));
  const maxY = Math.max(container.internalH, ...pieces.map((p) => p.y + p.height));
  const scale = Math.min((WIDTH - 14) / (maxZ - minZ), maxHeight / maxY);
  const left = MARGIN + (WIDTH - (maxZ - minZ) * scale) / 2;
  const px = (z: number) => left + (z - minZ) * scale;
  // The floor is the bottom line: heights grow upwards.
  const floorY = top + maxY * scale;
  const py = (y: number) => floorY - y * scale;
  doc.setFillColor("#f8fafc");
  doc.setDrawColor(MUTED);
  doc.setLineWidth(0.4);
  doc.rect(px(0), py(container.internalH), container.internalL * scale, container.internalH * scale, "FD");
  // One piece per place and level: pieces side by side across the container cover each other from here.
  const seen = new Set<string>();
  for (const piece of [...pieces].sort((a, b) => a.x - b.x)) {
    const key = `${piece.z}|${piece.y}|${piece.length}|${piece.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    doc.setFillColor(colourOf(piece.lineId));
    doc.setDrawColor(BODY);
    doc.setLineWidth(0.2);
    doc.rect(px(piece.z), py(piece.y + piece.height), piece.length * scale, piece.height * scale, "FD");
  }
  setFont(doc, "bold", 7, MUTED);
  doc.text("SIDE VIEW", px(minZ), top - 1.5);
  return maxY * scale;
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
    ["Balanced", `${totals.balanced} of ${plan.loads.length} containers`, totals.balanced < plan.loads.length ? RED : undefined],
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
    : "Equipment chosen by the planner: standard containers first, open tops for over-height, flat racks last; a 45' or a hard-top only when nominated.";
  const clear = input.rules?.clearance ?? NO_CLEARANCE;
  const anyClearance = clear.doorWidthMm > 0 || clear.doorHeightMm > 0 || clear.lengthMm > 0;
  const clearanceNote = anyClearance
    ? ` Standard containers are planned with a clearance left free: ${formatDim(clear.doorWidthMm, unit)} ${unit} on door width, ${formatDim(clear.doorHeightMm, unit)} ${unit} on door height and ${formatDim(clear.lengthMm, unit)} ${unit} on length.`
    : "";
  y = paragraph(doc, `${equipment}${clearanceNote}`, y, "normal", BODY, newPage);
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
        { swatch: colourOf(line.id), text: `${line.name || "Cargo"}${isDangerous(line) ? ` (${dgWords(line)})` : ""}` },
        sizeText(line.lengthMm, line.widthMm, line.heightMm, unit),
        formatKg(line.weightKg),
        String(line.colli),
        formatKg(line.weightKg * line.colli),
        line.stackable ? "Yes" : "No",
        standardLabel(line, input.rules, input.with45),
      ],
      y,
    );
    y += 5.5;
  }

  // What no figure says: the plan's note for the stuffing gang, and each line's lashing note (Council Outlay 14, P11).
  const lashing = lashingNotes(input.lines, numberOf);
  if (input.note?.trim() || lashing.length > 0) {
    y += 5;
    if (input.note?.trim()) y = paragraph(doc, `Note for the stuffing gang: ${input.note.trim()}`, y, "bold", INK, newPage);
    for (const text of lashing) y = paragraph(doc, `Lashing, line ${text}`, y, "normal", BODY, newPage);
  }
}

function loadPage(doc: jsPDF, input: PlanPdfInput, load: ContainerLoad, number: number, colourOf: (lineId: string) => string, numberOf: (lineId: string) => number) {
  const { unit } = input;
  const { container } = load;
  const stats = loadStats(load);
  const title = `#${number} of ${input.plan.loads.length} · ${container.name}`;
  pageHead(doc, title, input);

  let y = MARGIN + 14;
  const stacked = load.pieces.some((piece) => piece.y > 0);
  y += drawFloor(doc, load, colourOf, numberOf, y, stacked ? 46 : 60) + (stacked ? 7 : 8);
  if (stacked) y += drawSide(doc, load, colourOf, y, 20) + 8;

  // Five figures in one row, each as wide as its longest value, and the centre of gravity with its
  // limit on a row of its own: together they would not fit across the page.
  const widths = [18, 52, 60, 26, 36, 81];
  const { balance } = stats;
  const figures: [string, string, string?][] = [
    ["Colli", String(stats.pieceCount)],
    ["Weight (of payload)", `${formatKg(load.totalWeightKg)}  (${pctText(stats.payloadPct)})`],
    // Cargo with the empty container: an estimate for the VGM, the weighed figure decides.
    ["Gross, estimated (tare)", `${formatKg(stats.grossKg)}  (${formatKg(stats.tareKg)})`],
    ["Floor used", pctText(stats.floorPct)],
    ["Highest point", `${formatDim(stats.topMm, unit)} ${unit}`],
    ["Check", [balance.ok ? "Balanced" : "OUT OF BALANCE", stats.outOfGauge ? "Out of gauge" : stats.linerConfirm ? "Liner to confirm" : ""].filter(Boolean).join(" · "), balance.ok ? (stats.outOfGauge || stats.linerConfirm ? AMBER : GREEN) : RED],
  ];
  let x = MARGIN;
  figures.forEach(([name, text, colour], index) => {
    label(doc, name, x, y);
    value(doc, text, x, y + 5, (widths[index] ?? 40) - 3, colour);
    x += widths[index] ?? 40;
  });
  y += 12;
  label(doc, `Centre of gravity (limit ${balanceLimitText(container, unit)})`, MARGIN, y);
  const off = `${formatDim(Math.abs(balance.cogZ - container.internalL / 2), unit)} ${unit} off lengthwise, ${formatDim(Math.abs(balance.cogX - container.internalW / 2), unit)} ${unit} off sideways`;
  value(doc, off, MARGIN, y + 5, WIDTH, balance.ok ? undefined : RED);
  y += 13;

  const columns: Column[] = [
    { title: "No.", width: 12 },
    { title: "Cargo", width: 58 },
    { title: "Colli", width: 16, right: true },
    { title: `Loaded as L × W × H (${unit})`, width: 52 },
    { title: "Weight / pc", width: 28, right: true },
    { title: "Notes", width: 107 },
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
        notesOf(group, container, unit),
      ],
      y,
    );
    y += 5.5;
  }

  // The stuffing sheet: the order to load in, from the far end to the doors. Steps that repeat are one row.
  const farEnd = hasDoors(container) ? "front wall" : "left end wall";
  const order: Column[] = [
    { title: "Step", width: 22 },
    { title: "No.", width: 12 },
    { title: "Cargo", width: 62 },
    { title: "Colli", width: 16, right: true },
    { title: "On the floor", width: 76 },
    { title: "How", width: 85 },
  ];
  y += 5;
  if (y > BOTTOM - 16) y = newPage();
  setFont(doc, "bold", 9, INK);
  doc.text(clean(`Loading order: from the ${farEnd} ${hasDoors(container) ? "to the doors" : "to the other end"}, left to right`), MARGIN, y);
  y = tableHead(doc, order, y + 6);
  for (const run of loadingRuns(load)) {
    if (y > BOTTOM) y = tableHead(doc, order, newPage());
    tableRow(
      doc,
      order,
      [
        stepsText(run),
        String(numberOf(run.lineId)),
        { swatch: colourOf(run.lineId), text: run.name || "Cargo" },
        String(run.count),
        // The unit stands once, after the second figure: "77 to 3,277 mm from the left end wall".
        whereText(run, farEnd, (mm) => `${formatDim(mm, unit)} ${unit}`).replace(` ${unit} to `, " to "),
        howText(run),
      ],
      y,
    );
    y += 5.5;
  }

  // Every warning in full, over as many lines and pages as it needs.
  y += 2;
  if (stats.endWallsFolded) y = paragraph(doc, END_WALLS_NOTE, y, "bold", AMBER, newPage);
  // Two classes of dangerous goods in the container: said first, in red (Council Outlay 14, P11).
  const dg = dgWarning(load, (lineId) => input.lines.find((line) => line.id === lineId));
  if (dg) y = paragraph(doc, dg, y, "bold", RED, newPage);
  for (const warning of ruleWarnings(load, unit)) y = paragraph(doc, warning, y, "bold", AMBER, newPage);
  for (const overload of stats.floorOverloads) y = paragraph(doc, floorOverloadText(overload, container, unit), y, "bold", AMBER, newPage);
  if (!balance.ok) {
    y = paragraph(doc, outOfBalanceText(container, unit), y, "bold", RED, newPage);
  }
  if (!hasDoors(container)) paragraph(doc, "A flat rack has no doors: positions are measured from the left end wall.", y, "normal", MUTED, newPage);
}

/**
 * The plan as a PDF document: the summary, then a page (or more, for a long piece list) per
 * container. With `fonts` the text is set in a face that has Czech and other accented letters;
 * without, in the PDF's own Helvetica, with the accents taken off.
 */
export function buildPlanPdf(input: PlanPdfInput, fonts?: PdfFonts): jsPDF {
  const numberOf = input.numberOf ?? ((lineId: string) => input.lines.findIndex((line) => line.id === lineId) + 1);
  const colourOf = (lineId: string) => lineColour(input.colourIndexOf ? input.colourIndexOf(lineId) : numberOf(lineId) - 1).hex;
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
        clean("Seen from above, to scale. A piece carries the number of its cargo line; “×2” means two high; “s3” is its loading step. The cross is the middle of the floor, the dot the centre of gravity."),
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
