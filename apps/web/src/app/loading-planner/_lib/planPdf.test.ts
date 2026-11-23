import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
    expect(doc.getNumberOfPages()).toBe(1 + data.plan.loads.length);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2000);
    // A look at the real thing: PLAN_PDF_OUT=/some/file.pdf writes it out.
    if (process.env.PLAN_PDF_OUT) writeFileSync(process.env.PLAN_PDF_OUT, Buffer.from(doc.output("arraybuffer")));
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

describe("planPdfFileName", () => {
  it("keeps a name a file can have", () => {
    expect(planPdfFileName("Stroje do Nhava Sheva / 2026: část 1")).toBe("Stroje do Nhava Sheva 2026 cast 1.pdf");
    expect(planPdfFileName("  ")).toBe("Loading plan.pdf");
  });
});
