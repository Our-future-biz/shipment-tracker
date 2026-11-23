import { jsPDF } from "jspdf";
import { BALANCE_TOLERANCE_PCT } from "./balance";
import { gaugeLabel, gaugeOf, type CargoLine } from "./gauge";
import { lineColour, loadStats, planTotals, type PieceGroup } from "./loadStats";
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
  /** The cargo list, in the order of the screen: it gives every line its colour. */
  lines: CargoLine[];
  plan: LoadPlan;
  /** The names of the nominated container types; null when the planner chose. */
  nominated: string[] | null;
  unit: DimUnit;
  /** The day the PDF is made, as the app writes dates. */
  printedOn: string;
}

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;
const WIDTH = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 16;

// Slate, red, amber and emerald of the app's palette.
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const RULE = "#cbd5e1";
const RED = "#dc2626";
const AMBER = "#b45309";
const GREEN = "#059669";

// jsPDF's built-in Helvetica has no Czech diacritics; print the plain letters instead.
const plain = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Cuts a text to the width it has ("..." - the standard fonts have no ellipsis sign). */
function fit(doc: jsPDF, text: string, maxWidth: number): string {
  const value = plain(text);
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let t = value;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

const pctText = (value: number) => `${Math.round(value)}%`;
const offText = (value: number) => `${Math.abs(value) < 0.5 ? "0" : Math.abs(value).toFixed(0)}%`;

function label(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(MUTED);
  doc.text(text.toUpperCase(), x, y);
}

function value(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, colour = INK) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(colour);
  doc.text(fit(doc, text, maxWidth), x, y);
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text(column.title.toUpperCase(), column.right ? x + column.width - 2 : x, y, { align: column.right ? "right" : "left" });
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
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(BODY);
  columns.forEach((column, index) => {
    const cell = cells[index] ?? "";
    if (typeof cell === "string") {
      doc.text(fit(doc, cell, column.width - 2), column.right ? x + column.width - 2 : x, y, { align: column.right ? "right" : "left" });
    } else {
      doc.setFillColor(cell.swatch);
      doc.rect(x, y - 2.6, 3, 3, "F");
      doc.text(fit(doc, cell.text, column.width - 7), x + 5, y);
    }
    x += column.width;
  });
}

function pageHead(doc: jsPDF, title: string, input: PlanPdfInput) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text(fit(doc, title, WIDTH * 0.6), MARGIN, MARGIN + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
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

/** The floor of a container from above, to scale, in a box `maxHeight` high at most; returns the height used. */
function drawFloor(doc: jsPDF, load: ContainerLoad, colourOf: (lineId: string) => string, top: number, maxHeight: number): number {
  const { container, pieces } = load;
  const onFloor = pieces.filter((piece) => piece.y === 0);
  const minZ = Math.min(0, ...onFloor.map((p) => p.z));
  const maxZ = Math.max(container.internalL, ...onFloor.map((p) => p.z + p.length));
  const minX = Math.min(0, ...onFloor.map((p) => p.x));
  const maxX = Math.max(container.internalW, ...onFloor.map((p) => p.x + p.width));
  const scale = Math.min(WIDTH / (maxZ - minZ), maxHeight / (maxX - minX));
  // The drawing is centred across the page.
  const left = MARGIN + (WIDTH - (maxZ - minZ) * scale) / 2;
  const px = (z: number) => left + (z - minZ) * scale;
  const py = (x: number) => top + (x - minX) * scale;

  doc.setFillColor("#f8fafc");
  doc.setDrawColor(MUTED);
  doc.setLineWidth(0.4);
  doc.rect(px(0), py(0), container.internalL * scale, container.internalW * scale, "FD");

  doc.setDrawColor("#ffffff");
  doc.setLineWidth(0.25);
  for (const piece of onFloor) {
    doc.setFillColor(colourOf(piece.lineId));
    doc.rect(px(piece.z), py(piece.x), piece.length * scale, piece.width * scale, "FD");
    const high = pieces.filter((p) => p.x === piece.x && p.z === piece.z).length;
    if (high > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(Math.max(5, Math.min(11, Math.min(piece.length, piece.width) * scale * 1.2)));
      doc.setTextColor(INK);
      doc.text(`x${high}`, px(piece.z + piece.length / 2), py(piece.x + piece.width / 2), { align: "center", baseline: "middle" });
    }
  }

  // The middle of the floor (a cross) and the centre of gravity (a dot).
  const stats = loadStats(load);
  const [midX, midY] = [px(container.internalL / 2), py(container.internalW / 2)];
  doc.setDrawColor(INK);
  doc.setLineWidth(0.2);
  doc.line(midX - 2.5, midY, midX + 2.5, midY);
  doc.line(midX, midY - 2.5, midX, midY + 2.5);
  doc.setFillColor(stats.balance.ok ? GREEN : RED);
  doc.setDrawColor("#ffffff");
  doc.circle(px(stats.balance.cogZ), py(stats.balance.cogX), 1.3, "FD");

  return (maxX - minX) * scale;
}

function summaryPage(doc: jsPDF, input: PlanPdfInput, colourOf: (lineId: string) => string) {
  const { plan, unit } = input;
  const totals = planTotals(plan);
  pageHead(doc, "Loading plan", input);

  let y = MARGIN + 17;
  const quarter = WIDTH / 4;
  const figures: [string, string, string?][] = [
    ["Containers", `${plan.loads.length}${totals.equipment.length > 0 ? `  (${totals.equipment.map((e) => `${e.count} x ${e.name}`).join(", ")})` : ""}`],
    ["Pieces loaded", `${totals.pieces}${totals.notLoaded > 0 ? `  (${totals.notLoaded} not loaded)` : ""}`, totals.notLoaded > 0 ? RED : undefined],
    ["Weight loaded", formatKg(totals.weightKg)],
    ["Balanced", `${totals.balanced} of ${plan.loads.length} within ${BALANCE_TOLERANCE_PCT}% of the middle`, totals.balanced < plan.loads.length ? RED : undefined],
  ];
  figures.forEach(([title, text, colour], index) => {
    label(doc, title, MARGIN + quarter * index, y);
    value(doc, text, MARGIN + quarter * index, y + 5, quarter - 4, colour);
  });
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(BODY);
  const equipment = input.nominated ? `Equipment nominated: ${input.nominated.join(", ") || "none"}` : "Equipment chosen by the planner: standard containers first, open tops for over-height, flat racks last.";
  doc.text(fit(doc, `${equipment}   Made on ${input.printedOn}.`, WIDTH), MARGIN, y);
  y += 8;

  if (plan.notLoaded.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(RED);
    doc.text("NOT LOADED", MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    for (const entry of plan.notLoaded.slice(0, 8)) {
      doc.text(fit(doc, `${entry.colli} x ${entry.name || "Cargo"} - ${entry.reason}`, WIDTH), MARGIN, y);
      y += 4.5;
    }
    if (plan.notLoaded.length > 8) {
      doc.text(`and ${plan.notLoaded.length - 8} more lines`, MARGIN, y);
      y += 4.5;
    }
    y += 4;
  }

  const columns: Column[] = [
    { title: "Cargo", width: 78 },
    { title: `L x W x H (${unit})`, width: 58 },
    { title: "Weight / pc", width: 30, right: true },
    { title: "Colli", width: 18, right: true },
    { title: "Total weight", width: 32, right: true },
    { title: "Stackable", width: 22 },
    { title: "Gauge", width: 35 },
  ];
  y = tableHead(doc, columns, y);
  for (const [index, line] of input.lines.entries()) {
    if (y > BOTTOM) {
      doc.addPage();
      pageHead(doc, "Loading plan - cargo", input);
      y = tableHead(doc, columns, MARGIN + 17);
    }
    tableRow(
      doc,
      columns,
      [
        { swatch: colourOf(line.id), text: line.name || `Line ${index + 1}` },
        formatSize(line.lengthMm, line.widthMm, line.heightMm, unit).replace(/ ×/g, " x").replace(` ${unit}`, ""),
        formatKg(line.weightKg),
        String(line.colli),
        formatKg(line.weightKg * line.colli),
        line.stackable ? "Yes" : "No",
        gaugeLabel(gaugeOf(line)),
      ],
      y,
    );
    y += 5.5;
  }
}

function loadPage(doc: jsPDF, input: PlanPdfInput, load: ContainerLoad, number: number, colourOf: (lineId: string) => string) {
  const { unit } = input;
  const stats = loadStats(load);
  const title = `#${number} of ${input.plan.loads.length} - ${load.container.name}`;
  pageHead(doc, title, input);

  let y = MARGIN + 14;
  y += drawFloor(doc, load, colourOf, y, 62) + 8;

  const fifth = WIDTH / 5;
  const { balance } = stats;
  const figures: [string, string, string?][] = [
    ["Pieces", String(stats.pieceCount)],
    ["Weight", `${formatKg(load.totalWeightKg)}  (${pctText(stats.payloadPct)} of ${formatKg(load.container.payloadKg)})`],
    ["Floor used", pctText(stats.floorPct)],
    ["Centre of gravity", `${offText(balance.alongPct)} off along, ${offText(balance.acrossPct)} off across`, balance.ok ? undefined : RED],
    ["Check", [balance.ok ? "Balanced" : "OUT OF BALANCE", stats.outOfGauge ? "Out of gauge" : ""].filter(Boolean).join(" · "), balance.ok ? (stats.outOfGauge ? AMBER : GREEN) : RED],
  ];
  figures.forEach(([name, text, colour], index) => {
    label(doc, name, MARGIN + fifth * index, y);
    value(doc, text, MARGIN + fifth * index, y + 5, fifth - 4, colour);
  });
  y += 13;

  const columns: Column[] = [
    { title: "Cargo", width: 78 },
    { title: "Pieces", width: 18, right: true },
    { title: `Loaded as L x W x H (${unit})`, width: 62 },
    { title: "Weight / pc", width: 30, right: true },
    { title: "Notes", width: 85 },
  ];
  y = tableHead(doc, columns, y);
  for (const group of stats.groups) {
    if (y > BOTTOM) {
      doc.addPage();
      pageHead(doc, `${title} (continued)`, input);
      y = tableHead(doc, columns, MARGIN + 17);
    }
    tableRow(
      doc,
      columns,
      [
        { swatch: colourOf(group.lineId), text: group.name || "Cargo" },
        String(group.count),
        formatSize(group.length, group.width, group.height, unit).replace(/ ×/g, " x").replace(` ${unit}`, ""),
        formatKg(group.weightKg),
        [group.crosswise && "crosswise", group.stacked > 0 && `${group.stacked} stacked`, overText(group, unit)].filter(Boolean).join(" · "),
      ],
      y,
    );
    y += 5.5;
  }

  const warnings = [
    ...stats.bedding.map(
      (need) =>
        `${need.name || "Cargo"} puts ${need.tonnesPerMetre.toFixed(1)} t per metre on the floor (limit ${load.container.maxTonnesPerMetre} t/m): it needs bedding at least ${formatDim(need.beddingMm, unit)} ${unit} long.`,
    ),
    ...(balance.ok ? [] : [`The centre of gravity is more than ${BALANCE_TOLERANCE_PCT}% off the middle of the floor. Spread the weight over more containers or change the equipment.`]),
  ];
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  for (const [index, warning] of warnings.entries()) {
    if (y > BOTTOM) break;
    doc.setTextColor(index < stats.bedding.length ? AMBER : RED);
    doc.text(fit(doc, warning, WIDTH), MARGIN, y);
    y += 5;
  }
}

/** The plan as a PDF document: the summary, then a page (or more, for a long piece list) per container. */
export function buildPlanPdf(input: PlanPdfInput): jsPDF {
  const colourOf = (lineId: string) => lineColour(input.lines.findIndex((line) => line.id === lineId)).hex;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  doc.setProperties({ title: plain(`Loading plan - ${input.name}`) });

  summaryPage(doc, input, colourOf);
  input.plan.loads.forEach((load, index) => {
    doc.addPage();
    loadPage(doc, input, load, index + 1, colourOf);
  });

  // The foot of every page, once the number of pages is known.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text("Floor plans are seen from above, to scale: the cross is the middle of the floor, the dot the centre of gravity. Check lashing and the carrier's limits before loading.", MARGIN, PAGE_H - 8);
    doc.text(`Page ${page} of ${pages}`, MARGIN + WIDTH, PAGE_H - 8, { align: "right" });
  }
  return doc;
}

/** The file name of a plan's PDF: its name with only letters, digits, spaces, dashes and underscores kept. */
export const planPdfFileName = (name: string): string => `${plain(name).replace(/[^A-Za-z0-9 _-]+/g, " ").replace(/\s+/g, " ").trim() || "Loading plan"}.pdf`;
