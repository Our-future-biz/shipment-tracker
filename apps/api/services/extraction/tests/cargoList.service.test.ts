import { beforeEach, describe, expect, it, vi } from "vitest";

// The reader is run for real against a stand-in for the AI: what it is sent, and what it makes of the reply.
const create = vi.hoisted(() => vi.fn());
const pdfText = vi.hoisted(() => ({ value: "" }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../lib/anthropic", () => ({
  MODEL: "test",
  replyText: (response: { content: { text: string }[] }) => response.content.map((block) => block.text).join(""),
  askAi: (params: unknown) => create(params),
}));
vi.mock("../lib/pdf", () => ({
  detectMediaType: (name: string) => (name.endsWith(".png") ? "image/png" : "application/pdf"),
  extractTextFromPdf: async () => pdfText.value,
}));

import { CARGO_LIST_PROMPT, MAX_CARGO_LINES, MAX_CARGO_TEXT } from "../lib/cargoList";
import { readCargoFile, readCargoText } from "../services/cargoList.service";

interface Asked {
  system: string;
  max_tokens: number;
  messages: { content: string | { type: string }[] }[];
}
const reply = (text: string, stop_reason = "end_turn") => ({ content: [{ type: "text", text }], stop_reason });
const pallet = { name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 400, colli: 4, stackable: null, note: "" };
const asked = (n = 0) => create.mock.calls[n]![0] as Asked;
const contentOf = (n = 0) => asked(n).messages[0]!.content;
const PDF_TEXT = "PACKING LIST no. 77 - 4 pallets 120 x 80 x 100 cm, 400 kg each";

beforeEach(() => {
  create.mockReset();
  pdfText.value = "";
});

describe("readCargoText", () => {
  it("sends the text under the reader's instructions and returns the checked lines", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ lines: [pallet] })));
    await expect(readCargoText("4 pallets 120x80x100 cm 400 kg each")).resolves.toEqual({ lines: [pallet], partial: false });
    expect(asked().system).toBe(CARGO_LIST_PROMPT);
    expect(contentOf()).toContain("4 pallets 120x80x100 cm 400 kg each");
  });

  it("sends no more text than one reading takes, and says lines may be missing", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ lines: [pallet] })));
    const long = "x".repeat(MAX_CARGO_TEXT) + "THE END OF THE LIST";
    await expect(readCargoText(long)).resolves.toMatchObject({ partial: true });
    expect(contentOf()).not.toContain("THE END OF THE LIST");
  });

  it("keeps the complete lines of a reply cut off at its length limit, as a partial reading", async () => {
    const whole = JSON.stringify({ lines: [pallet, { ...pallet, name: "Case" }, { ...pallet, name: "Transformer" }] });
    create.mockResolvedValue(reply(whole.slice(0, whole.indexOf("Transformer") + 4), "max_tokens"));
    const read = await readCargoText("a very long packing list");
    expect(read.lines.map((line) => line.name)).toEqual(["Pallet", "Case"]);
    expect(read.partial).toBe(true);
  });

  it("takes a reply that is a bare list of lines", async () => {
    create.mockResolvedValue(reply(JSON.stringify([pallet, { ...pallet, name: "Case" }])));
    await expect(readCargoText("two kinds of pieces")).resolves.toMatchObject({ lines: [{ name: "Pallet" }, { name: "Case" }], partial: false });
  });

  it("says lines may be missing when the reply holds more lines than a plan does", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ lines: Array.from({ length: MAX_CARGO_LINES + 1 }, (_, i) => ({ ...pallet, name: `Case ${i}` })) })));
    const read = await readCargoText("a packing list of 201 kinds of pieces");
    expect(read.lines).toHaveLength(MAX_CARGO_LINES);
    expect(read.partial).toBe(true);
  });

  it("allows a reply long enough for a full plan of lines", async () => {
    create.mockResolvedValue(reply('{"lines":[]}'));
    await readCargoText("a packing list");
    expect(asked().max_tokens).toBeGreaterThanOrEqual(MAX_CARGO_LINES * 80);
  });
});

describe("readCargoFile, a PDF", () => {
  it("reads the PDF's text, and does not read the page again when lines were found", async () => {
    pdfText.value = PDF_TEXT;
    create.mockResolvedValue(reply(JSON.stringify({ lines: [pallet] })));
    await expect(readCargoFile("QUJD", "list.pdf")).resolves.toEqual({ lines: [pallet], partial: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(contentOf()).toContain(PDF_TEXT);
  });

  it("reads the page itself when the text holds no cargo line", async () => {
    pdfText.value = PDF_TEXT;
    create.mockResolvedValueOnce(reply('{"lines":[]}')).mockResolvedValueOnce(reply(JSON.stringify({ lines: [pallet] })));
    await expect(readCargoFile("QUJD", "list.pdf")).resolves.toEqual({ lines: [pallet], partial: false });
    expect(create).toHaveBeenCalledTimes(2);
    expect(contentOf(1)).toMatchObject([{ type: "document" }, { type: "text" }]);
  });

  it("does not pay for a second reading when the first was merely cut off", async () => {
    pdfText.value = PDF_TEXT;
    // Cut before the first line was complete: no line, but the text did hold cargo.
    create.mockResolvedValue(reply('{"lines":[{"name":"Pall', "max_tokens"));
    await expect(readCargoFile("QUJD", "list.pdf")).resolves.toEqual({ lines: [], partial: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("reads a scan, which has no text, as a picture of the page", async () => {
    pdfText.value = "  \n ";
    create.mockResolvedValue(reply(JSON.stringify({ lines: [pallet] })));
    await readCargoFile("QUJD", "scan.pdf");
    expect(create).toHaveBeenCalledTimes(1);
    expect(contentOf()).toMatchObject([{ type: "document" }, { type: "text" }]);
  });
});

describe("readCargoFile, other files", () => {
  it("reads a .csv saved in windows-1250 with its letters right", async () => {
    create.mockResolvedValue(reply('{"lines":[]}'));
    // "Dřevěná bedna" as Excel on a Czech Windows saves it.
    const cp1250 = Buffer.from([0x44, 0xf8, 0x65, 0x76, 0xec, 0x6e, 0xe1, 0x20, 0x62, 0x65, 0x64, 0x6e, 0x61, 0x3b, 0x34]);
    await readCargoFile(cp1250.toString("base64"), "list.csv");
    expect(contentOf()).toContain("Dřevěná bedna;4");
  });

  it("refuses a kind of file it does not read, without asking the AI", async () => {
    await expect(readCargoFile("QUJD", "archive.zip")).rejects.toMatchObject({ code: "invalid_argument" });
    expect(create).not.toHaveBeenCalled();
  });

  it("passes on why a workbook cannot be opened", async () => {
    await expect(readCargoFile(Buffer.from("not a workbook").toString("base64"), "list.xlsx")).rejects.toMatchObject({
      code: "invalid_argument",
      message: "The Excel file could not be opened. Save it as .xlsx and try again.",
    });
    expect(create).not.toHaveBeenCalled();
  });
});
