import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CARGO_LIST_PROMPT, MAX_CARGO_LINES, cargoFileKind, cargoLinesOfReply, workbookText } from "../lib/cargoList";

describe("cargoLinesOfReply", () => {
  it("keeps what the reading gives and rounds sizes to whole millimetres", () => {
    const lines = cargoLinesOfReply({
      lines: [{ name: " Wooden case ", lengthMm: 2500.4, widthMm: "1200", heightMm: 1800, weightKg: 950.5, colli: 2, stackable: false, note: "Sizes assumed to be in cm." }],
    });
    expect(lines).toEqual([
      { name: "Wooden case", lengthMm: 2500, widthMm: 1200, heightMm: 1800, weightKg: 950.5, colli: 2, stackable: false, note: "Sizes assumed to be in cm." },
    ]);
  });

  it("never fills in what is missing: an absent or unusable figure stays null", () => {
    const [line] = cargoLinesOfReply({ lines: [{ name: "Machine", lengthMm: 5000, widthMm: null, heightMm: "n/a", weightKg: 0, colli: -1, stackable: "yes" }] });
    expect(line).toEqual({ name: "Machine", lengthMm: 5000, widthMm: null, heightMm: null, weightKg: null, colli: null, stackable: null, note: "" });
  });

  it("drops empty lines and whatever is not a line", () => {
    expect(cargoLinesOfReply({ lines: [{ name: "", lengthMm: null }, "Total 5 pcs", null, { name: "Pallet", colli: 4 }] })).toHaveLength(1);
    expect(cargoLinesOfReply({ lines: "none" })).toEqual([]);
    expect(cargoLinesOfReply(null)).toEqual([]);
  });

  it("stops at the most lines a plan holds", () => {
    const many = Array.from({ length: MAX_CARGO_LINES + 20 }, (_, i) => ({ name: `Case ${i}`, colli: 1 }));
    expect(cargoLinesOfReply({ lines: many })).toHaveLength(MAX_CARGO_LINES);
  });
});

describe("the reading's instructions", () => {
  it("forbid making values up and ask for one piece's size and weight", () => {
    expect(CARGO_LIST_PROMPT).toContain("NEVER invent a value");
    expect(CARGO_LIST_PROMPT).toContain("ONE piece");
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

  it("turns a workbook into text, a row per line, formulas as their results", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Packing");
    ws.addRow(["Description", "L (cm)", "W (cm)", "H (cm)", "Kg", "Pcs"]);
    ws.addRow(["Pallet", 120, 80, 100, { formula: "200*2", result: 400 }, 4]);
    ws.addRow([]);
    wb.addWorksheet("Empty");
    const text = await workbookText(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(text).toBe('Sheet "Packing":\nDescription\tL (cm)\tW (cm)\tH (cm)\tKg\tPcs\nPallet\t120\t80\t100\t400\t4');
  });
});
