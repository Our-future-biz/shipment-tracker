import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  MAX_CARGO_LINES,
  MAX_CARGO_TEXT,
  cargoEntriesOfReply,
  cargoFileKind,
  cargoFileProblem,
  cargoLinesOfReply,
  cargoTextOfFile,
  workbookText,
} from "../lib/cargoList";

describe("cargoLinesOfReply", () => {
  it("keeps what the reading gives and rounds sizes to whole millimetres", () => {
    const lines = cargoLinesOfReply([{ name: " Wooden case ", lengthMm: 2500.4, widthMm: "1200", heightMm: 1800, weightKg: 950.5, colli: 2, stackable: false, note: "Sizes assumed to be in cm." }]);
    expect(lines).toEqual([
      { name: "Wooden case", lengthMm: 2500, widthMm: 1200, heightMm: 1800, weightKg: 950.5, colli: 2, stackable: false, note: "Sizes assumed to be in cm." },
    ]);
  });

  it("never fills in what is missing: an absent or unusable figure stays null, without a note", () => {
    const [line] = cargoLinesOfReply([{ name: "Machine", lengthMm: 5000, widthMm: null, heightMm: "n/a", weightKg: 0, colli: -1, stackable: "yes" }]);
    expect(line).toEqual({ name: "Machine", lengthMm: 5000, widthMm: null, heightMm: null, weightKg: null, colli: null, stackable: null, note: "" });
  });

  it("says what the document gives when a figure is more than a plan line holds, and does not keep it", () => {
    const [line] = cargoLinesOfReply([{ name: "Screws", lengthMm: 150_000, widthMm: 100, heightMm: 100, weightKg: 1_200_000, colli: 5000, note: "Weights in kg." }]);
    expect(line).toMatchObject({ lengthMm: null, widthMm: 100, weightKg: null, colli: null });
    expect(line!.note).toBe(
      "Weights in kg. The document says a length of 150 m: more than a plan line holds (100 m). The document says a weight of 1,200 t a colli: more than a plan line holds (1,000 t). The document says 5,000 colli: more than one plan line holds (2,000).",
    );
  });

  it("does not round a figure below 1 up to 1, nor a part of a colli to a whole one", () => {
    const [small, half] = cargoLinesOfReply([
      { name: "Foil", lengthMm: 1000, widthMm: 1000, heightMm: 0.4, colli: 0.5 },
      { name: "Drum", colli: 2.5 },
    ]);
    expect(small).toMatchObject({ heightMm: null, colli: null, note: "The document says a height of less than 1 mm. The document says 0.5 colli, which is not a whole number." });
    expect(half).toMatchObject({ colli: null, note: "The document says 2.5 colli, which is not a whole number." });
  });

  it("drops empty lines and whatever is not a line", () => {
    expect(cargoLinesOfReply([{ name: "", lengthMm: null }, "Total 5 pcs", null, { name: "Pallet", colli: 4 }])).toHaveLength(1);
    expect(cargoLinesOfReply([])).toEqual([]);
  });

  it("stops at the most lines a plan holds", () => {
    const many = Array.from({ length: MAX_CARGO_LINES + 20 }, (_, i) => ({ name: `Case ${i}`, colli: 1 }));
    expect(cargoLinesOfReply(many)).toHaveLength(MAX_CARGO_LINES);
  });
});

describe("cargoEntriesOfReply", () => {
  const pallet = { name: "Pallet", colli: 4, note: "" };
  const crate = { name: 'Crate "A" {fragile}', colli: 1, note: "Sizes in [cm]." };

  it("reads the reply as asked, also inside a code fence or after a word of introduction", () => {
    expect(cargoEntriesOfReply(JSON.stringify({ lines: [pallet, crate] }))).toEqual({ entries: [pallet, crate], whole: true });
    expect(cargoEntriesOfReply("Here you are:\n```json\n" + JSON.stringify({ lines: [pallet] }) + "\n```")).toEqual({ entries: [pallet], whole: true });
  });

  it("takes a bare list of lines as well", () => {
    expect(cargoEntriesOfReply(JSON.stringify([pallet, crate]))).toEqual({ entries: [pallet, crate], whole: true });
    expect(cargoEntriesOfReply(JSON.stringify([pallet]))).toEqual({ entries: [pallet], whole: true });
  });

  it("keeps every complete line of a reply cut off in the middle of one, and says it is not whole", () => {
    const whole = JSON.stringify({ lines: [pallet, crate, { name: "Transformer", colli: 2, note: "" }] });
    // Cut inside the third line, as a reply is at its length limit.
    const cut = whole.slice(0, whole.indexOf("Transformer") + 5);
    expect(cargoEntriesOfReply(cut)).toEqual({ entries: [pallet, crate], whole: false });
    // The same for a bare list, and for a cut inside a text with a bracket in it.
    const list = JSON.stringify([pallet, crate]);
    expect(cargoEntriesOfReply(list.slice(0, list.indexOf("Sizes in [") + 10))).toEqual({ entries: [pallet], whole: false });
  });

  it("finds no line in a reply that says there are none, or says nothing usable", () => {
    expect(cargoEntriesOfReply('{"lines":[]}')).toEqual({ entries: [], whole: true });
    expect(cargoEntriesOfReply("{}")).toEqual({ entries: [], whole: true });
    expect(cargoEntriesOfReply("I could not read the document.")).toEqual({ entries: [], whole: false });
  });
});

describe("files", () => {
  it("tells the kinds of file a cargo list comes as", () => {
    expect(cargoFileKind("Packing List.PDF")).toBe("pdf");
    expect(cargoFileKind("photo.jpeg")).toBe("image");
    expect(cargoFileKind("cargo.xlsx")).toBe("xlsx");
    expect(cargoFileKind("list.csv")).toBe("text");
    expect(cargoFileKind("old.xls")).toBe("unknown");
    expect(cargoFileKind("archive.zip")).toBe("unknown");
  });

  it("refuses, before any reading, a kind it does not read, a picture over 5 MB and a file over 20 MB", () => {
    const base64OfBytes = (bytes: number) => "A".repeat(Math.ceil((bytes * 4) / 3));
    expect(cargoFileProblem("archive.zip", "AAAA")).toContain("This kind of file cannot be read");
    expect(cargoFileProblem("photo.jpg", base64OfBytes(6 * 1024 * 1024))).toBe("The picture is larger than 5 MB. Save it smaller (a lower resolution or a JPG) and try again.");
    expect(cargoFileProblem("photo.jpg", base64OfBytes(4 * 1024 * 1024))).toBeNull();
    // A PDF may be larger than a picture, up to the file limit.
    expect(cargoFileProblem("list.pdf", base64OfBytes(6 * 1024 * 1024))).toBeNull();
    expect(cargoFileProblem("list.pdf", base64OfBytes(21 * 1024 * 1024))).toBe("The file is larger than 20 MB. Send a smaller file, or paste the cargo list as text.");
  });

  it("reads a text file as UTF-8, and as windows-1250 when it is not UTF-8", () => {
    expect(cargoTextOfFile(Buffer.from("Dřevěná bedna;1200;800", "utf8"))).toBe("Dřevěná bedna;1200;800");
    // "Dřevěná" as Excel on a Czech Windows saves it: ř = F8, ě = EC, á = E1.
    const cp1250 = Buffer.from([0x44, 0xf8, 0x65, 0x76, 0xec, 0x6e, 0xe1, 0x3b, 0x31, 0x32, 0x30, 0x30]);
    expect(cargoTextOfFile(cp1250)).toBe("Dřevěná;1200");
  });
});

describe("workbookText", () => {
  const bufferOf = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer());

  it("turns a workbook into text, a row per line, formulas as their results", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Packing");
    ws.addRow(["Description", "L (cm)", "W (cm)", "H (cm)", "Kg", "Pcs"]);
    ws.addRow(["Pallet", 120, 80, 100, { formula: "200*2", result: 400 }, 4]);
    ws.addRow([]);
    wb.addWorksheet("Empty");
    expect(await workbookText(await bufferOf(wb))).toBe('Sheet "Packing":\nDescription\tL (cm)\tW (cm)\tH (cm)\tKg\tPcs\nPallet\t120\t80\t100\t400\t4');
  });

  it("leaves a hidden sheet out", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Packing").addRow(["Pallet", 4]);
    wb.addWorksheet("Costs", { state: "hidden" }).addRow(["Buy price", 1200]);
    expect(await workbookText(await bufferOf(wb))).toBe('Sheet "Packing":\nPallet\t4');
  });

  it("stops gathering rows once there is more text than one reading takes", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Long");
    for (let i = 0; i < 2000; i++) ws.addRow([`Case number ${i} of a very long packing list`, 1200, 800, 1000]);
    wb.addWorksheet("Next").addRow(["never reached"]);
    const text = await workbookText(await bufferOf(wb));
    // Just past the limit, so the reading knows the text was cut - and not the whole 100,000 characters.
    expect(text.length).toBeGreaterThan(MAX_CARGO_TEXT);
    expect(text.length).toBeLessThan(MAX_CARGO_TEXT + 200);
    expect(text).not.toContain("never reached");
  });

  it("refuses what is no .xlsx with a sentence that says what to do", async () => {
    await expect(workbookText(Buffer.from("Description;Pcs\nPallet;4"))).rejects.toMatchObject({ code: "invalid_argument", message: "The Excel file could not be opened. Save it as .xlsx and try again." });
    const oldXls = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(100)]);
    await expect(workbookText(oldXls)).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("old Excel 97–2003 (.xls)") });
  });

  it("refuses a small file that unpacks to far more than a cargo list", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bomb");
    // 60 MB of one repeated letter: a few hundred kB as a zip.
    const filler = "A".repeat(30_000);
    // Each text its own (the number in front): the same text twice is stored once.
    for (let i = 0; i < 2000; i++) ws.addRow([`${i}${filler}`]);
    const buffer = await bufferOf(wb);
    expect(buffer.length).toBeLessThan(5 * 1024 * 1024);
    await expect(workbookText(buffer)).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("unpacks to more than 50 MB") });
  });
});
