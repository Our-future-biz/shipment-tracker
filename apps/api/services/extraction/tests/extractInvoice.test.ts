import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const pdfText = vi.hoisted(() => ({ value: "" }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth: { placeLookup: vi.fn() } }));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn() } }));
vi.mock("../lib/anthropic", () => ({
  MODEL: "test",
  replyText: (response: { content: { text: string }[] }) => response.content.map((block) => block.text).join(""),
  getClient: () => ({ messages: { create } }),
}));
vi.mock("../lib/pdf", () => ({
  detectMediaType: (name: string) => (name.endsWith(".png") ? "image/png" : "application/pdf"),
  isImageType: (mediaType: string) => mediaType.startsWith("image/"),
  isPdfType: (mediaType: string) => mediaType === "application/pdf",
  extractTextFromPdf: async () => pdfText.value,
}));

import { extractCustomsFromFile, extractFromTextByDestination, extractInvoiceFromFile } from "../services/extraction.service";
import { INVOICE_HEADER_PROMPT } from "../lib/prompts";

const reply = (text: string, stop_reason = "end_turn") => ({ content: [{ type: "text", text }], stop_reason });
const HEADER = { total_amount: "3650.41", currency: "USD", vendor: "GLOBELINK", invoice_number: "AS260707595" };
// A reply that ran out of room in the middle of its rows.
const CUT = reply(`{"total_amount": "3650.41", "currency": "USD", "lines": [{"bl": "GLSL26060771", "item": "POD COST", "amount": "399.6`, "max_tokens");
const TEXT = "DEBIT NOTE AS260707595 GLOBELINK total USD 3,650.41";

beforeEach(() => {
  create.mockReset();
  pdfText.value = "";
});

describe("a long invoice", () => {
  it("is read again for its header when its rows run past the reply's room, and says so", async () => {
    create.mockResolvedValueOnce(CUT).mockResolvedValueOnce(reply(JSON.stringify(HEADER)));
    const result = await extractInvoiceFromFile("aGVsbG8=", "debit.png");
    expect(result.extracted).toEqual(HEADER);
    expect(result.invoiceLines).toEqual([]);
    expect(result.invoiceLinesSkipped).toBe(true);
    // The second reading asks for no rows.
    const second = create.mock.calls[1]![0] as { system: string; max_tokens: number };
    expect(second.system.startsWith(INVOICE_HEADER_PROMPT)).toBe(true);
    expect(second.system).not.toContain('"lines"');
  });

  it("is read again when its reply holds no JSON object", async () => {
    create.mockResolvedValueOnce(reply("Sorry, I ran out of space")).mockResolvedValueOnce(reply(JSON.stringify(HEADER)));
    const result = await extractFromTextByDestination(TEXT, "invoicing");
    expect(result.extracted).toEqual(HEADER);
    expect(result.invoiceLinesSkipped).toBe(true);
  });

  it("is read once with its rows when they fit", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({ ...HEADER, lines: [{ bl: "GLSL26060771", item: "POD COST", amount: "399.60" }] })));
    const result = await extractInvoiceFromFile("aGVsbG8=", "debit.png");
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.invoiceLines).toHaveLength(1);
    expect(result.invoiceLinesSkipped).toBeUndefined();
  });
});

describe("a customs document read as an image", () => {
  it("has the room of any other reading, not a few hundred tokens", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({ "MRN Number": "25CZ590000E0123456" })));
    await extractCustomsFromFile("aGVsbG8=", "scan.png");
    expect((create.mock.calls[0]![0] as { max_tokens: number }).max_tokens).toBeGreaterThanOrEqual(2048);
  });
});
