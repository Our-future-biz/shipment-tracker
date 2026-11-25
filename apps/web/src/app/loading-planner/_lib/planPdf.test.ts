import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./containers";
import type { CargoLine } from "./gauge";
import { planLoad } from "./plan";
import { buildPlanPdf, planPdfFileName, type PdfFonts, type PlanPdfInput } from "./planPdf";

// The font files the browser fetches from /fonts.
const font = (name: string) => readFileSync(join(process.cwd(), "public/fonts", name)).toString("base64");
const FONTS: PdfFonts = { regular: font("DejaVuSans.ttf"), bold: font("DejaVuSans-Bold.ttf") };

const line = (id: string, name: string, lengthMm: number, widthMm: number, heightMm: number, weightKg: number, colli: number, stackable = false): CargoLine => ({
  id,
  name,
  lengthMm,
  widthMm,
  heightMm,
  weightKg,
  colli,
  canTurn: true,
  stackable,
});

const LINES = [
  line("a", "Paleta s díly", 1200, 800, 1000, 400, 40, true),
  line("b", "Machine", 5000, 3000, 2000, 15000, 1),
  line("c", "Coil", 1000, 1000, 1000, 25000, 1),
  line("d", "Transformer", 6000, 3000, 3200, 40000, 1),
];

const input = (lines: CargoLine[], more: Partial<PlanPdfInput> = {}): PlanPdfInput => ({
  name: "Stroje do Nhava Sheva",
  job: "Shipment CZ00000053",
  lines,
  plan: planLoad(lines),
  nominated: null,
  unit: "mm",
  printedOn: "23.11.2026",
  ...more,
});

describe("buildPlanPdf", () => {
  it("makes a summary page and a page per container", () => {
    const data = input(LINES);
    const doc = buildPlanPdf(data, FONTS);
    expect(data.plan.loads.length).toBeGreaterThan(1);
    // A look at the real thing: PLAN_PDF_OUT=/some/file.pdf writes it out.
    if (process.env.PLAN_PDF_OUT) writeFileSync(process.env.PLAN_PDF_OUT, Buffer.from(doc.output("arraybuffer")));
    // A page per container at least: its loading order may carry it onto a second one.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1 + data.plan.loads.length);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(1 + 2 * data.plan.loads.length);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2000);
  });

  it("is made without the font files too, and with every extra the screen passes", () => {
    const data = input(LINES, { company: "Čechofracht s.r.o.", madeBy: "Łukasz 张伟", unplanned: 2, saved: false, numberOf: (id) => ({ a: 1, b: 3, c: 4, d: 6 })[id] ?? 0 });
    expect(buildPlanPdf(data).getNumberOfPages()).toBe(buildPlanPdf(data, FONTS).getNumberOfPages());
  });

  it("carries a long warning and a long not-loaded list to further pages instead of cutting them", () => {
    const refused = Array.from({ length: 60 }, (_, i) => line(`r${i}`, `Transformer ${i + 1}`, 6000, 3000, 3200, 40000, 1));
    const data = input(refused);
    expect(data.plan.notLoaded.length).toBe(60);
    expect(buildPlanPdf(data, FONTS).getNumberOfPages()).toBeGreaterThan(2);
  });

  it("makes the summary alone for a plan with nothing loaded", () => {
    expect(buildPlanPdf(input([])).getNumberOfPages()).toBe(1);
    const refused = input([LINES[3]!]);
    expect(refused.plan.loads).toEqual([]);
    expect(buildPlanPdf(refused).getNumberOfPages()).toBe(1);
  });

  it("carries a long cargo list and a long piece list over to further pages", () => {
    const many = Array.from({ length: 60 }, (_, i) => line(`m${i}`, `Case ${i + 1}`, 900 + i, 700, 600, 100, 1));
    const data = input(many, { unit: "cm", nominated: ["40' HC"] });
    expect(buildPlanPdf(data).getNumberOfPages()).toBeGreaterThan(1 + data.plan.loads.length);
  });
});

/** The text a PDF shows, in the order it is written. jsPDF's own Helvetica keeps the text as it is in the page. */
const textOf = (doc: jsPDF): string =>
  (doc.internal as unknown as { pages: (string[] | undefined)[] }).pages
    .flatMap((page) => page ?? [])
    .flatMap((operator) => [...operator.matchAll(/\((.*)\) Tj/g)].map((match) => match[1]!.replace(/\\([()\\])/g, "$1")))
    .join(" ");

describe("the PDF's words", () => {
  it("says the units, the balance limit, the clearance and the warnings, and never NaN", () => {
    const press = [line("p", "Press", 3000, 2000, 2000, 6000, 1)];
    const text = textOf(buildPlanPdf(input(press, { unit: "cm", rules: DEFAULT_RULES, plan: planLoad(press, undefined, DEFAULT_RULES) })));
    expect(text).toContain("Sizes in cm, weights in kg.");
    expect(text).toContain("300 x 200 x 200");
    expect(text).toContain("CENTRE OF GRAVITY (LIMIT 60 CM LENGTHWISE, 11.8 CM SIDEWAYS)");
    expect(text).toContain("clearance left free: 5 cm on door width, 5 cm on door height and 10 cm on length.");
    expect(text).toContain("Press: 6,000 kg a piece, over the 5,000 kg set for a heavy piece in a standard container.");
    expect(text).toContain("cm from the front wall");
    expect(text).not.toContain("NaN");
    expect(textOf(buildPlanPdf(input(LINES, { unit: "m", rules: DEFAULT_RULES })))).not.toContain("NaN");
  });

  it("names every cargo line of a mixed stack, on the drawing and in the loading order (P9)", () => {
    const cargo = [
      { ...line("crate", "Crate", 1400, 1150, 1000, 600, 8), topLoadKg: 300 },
      line("carton", "Carton", 1000, 800, 800, 150, 8),
    ];
    const text = textOf(buildPlanPdf(input(cargo, { plan: planLoad(cargo, ["20dc"], DEFAULT_RULES) })));
    // Steps 1-16: line 1 with line 2 on it, eight of each, eight places two high.
    expect(text).toContain("1-16 1/2 Crate / Carton 8 + 8");
    expect(text).toContain("8 places, 2 high (the lower piece first)");
    expect(text).toContain('"1/2" a piece of line 2 on one of line 1');
    // A stack of one line reads as ever.
    // Twenty pallets of 1,200 x 1,000 do not all go on the floor of a 20' DC: some stand two high.
    const pallets = [line("p", "Pallet", 1200, 1000, 1000, 300, 20, true)];
    expect(textOf(buildPlanPdf(input(pallets, { plan: planLoad(pallets, ["20dc"], DEFAULT_RULES) })))).toContain("1 x2");
  });

  it("says which of the plan's containers each pinned number is (P8)", () => {
    const cargo = [{ ...line("a", "Crate A", 1200, 800, 1500, 400, 3), pinBox: 2 }, line("free", "Pallet", 1200, 800, 1500, 400, 20)];
    const plan = planLoad(cargo, ["20dc"], DEFAULT_RULES);
    expect(plan.loads.map((load) => load.pinBox)).toEqual([2, undefined, undefined]);
    const text = textOf(buildPlanPdf(input(cargo, { plan })));
    expect(text).toContain("Pinned: 1 Crate A container no. 2 (#1 of the plan).");
    expect(text).toContain("20' DC");
    expect(text).toContain("pinned container no. 2");
    expect(text.split("pinned container no.").length - 1).toBe(1);
  });

  it("measures a flat rack from its left end wall, in the notes as in the note under them", () => {
    const text = textOf(buildPlanPdf(input([LINES[1]!])));
    expect(text).toContain("mm from the left end wall");
    expect(text).toContain("positions are measured from the left end wall.");
    expect(text).not.toContain("front wall");
  });
});

describe("planPdfFileName", () => {
  it("keeps a name a file can have", () => {
    expect(planPdfFileName("Stroje do Nhava Sheva / 2026: část 1")).toBe("Stroje do Nhava Sheva 2026 cast 1.pdf");
    expect(planPdfFileName("  ")).toBe("Loading plan.pdf");
  });
});
