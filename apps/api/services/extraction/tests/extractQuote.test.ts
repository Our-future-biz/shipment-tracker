import { beforeEach, describe, expect, it, vi } from "vitest";

const placeLookup = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const pdfText = vi.hoisted(() => ({ value: "" }));
// A failing lookup is a plain function: vitest reports an error thrown by a vi.fn even when
// the code under test catches it.
const lookup = vi.hoisted(() => ({ fails: false }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({
  auth: {
    placeLookup: async (req: unknown) => {
      if (lookup.fails) throw new Error("auth down");
      return placeLookup(req);
    },
  },
}));
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

import { extractFromTextByDestination, extractQuoteFromFile } from "../services/extraction.service";
import { QUOTE_PROMPT, SHIPMENT_PROMPT } from "../lib/prompts";

const reply = (answer: unknown) => ({ content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) }] });
const noPlaces = { byCode: [], candidates: [[], [], [], []] };
const TEXT = "Dear team, please quote the shipment below.";

beforeEach(() => {
  placeLookup.mockReset();
  placeLookup.mockResolvedValue(noPlaces);
  create.mockReset();
  create.mockResolvedValue(reply({}));
  lookup.fails = false;
  pdfText.value = "";
});

describe("reading a customer's request for a quote", () => {
  it("returns pasted text in the forms a quote stores, without prices or other readers' labels", async () => {
    create.mockResolvedValueOnce(
      reply({
        Customer: " ACME s.r.o. ",
        "Trade Direction": "EXP",
        "Freight Mode": "LCL",
        Incoterm: "fob Shanghai",
        "Cargo Readiness Date": "2026-11-20",
        Origin: "DEHAM",
        Destination: "Nowhere, Atlantis",
        "Gross weight (kg)": "1 250 kg",
        "Selling price": "1200 EUR",
        Shipper: "X",
      }),
    );
    placeLookup.mockResolvedValue({
      byCode: [{ code: "DEHAM", countryCode: "DE", name: "Hamburg", subdivisionName: null }],
      candidates: [[], [], [], []],
    });

    const result = await extractFromTextByDestination(TEXT, "quote");

    const system = create.mock.calls[0]![0].system as string;
    expect(system).toContain(QUOTE_PROMPT);
    expect(system).toContain('- "Gross weight (kg)"');
    expect(result.extracted).toEqual({
      Customer: "ACME s.r.o.",
      "Trade Direction": "Export",
      "Freight Mode": "Sea LCL",
      Incoterm: "FOB",
      "Cargo Readiness Date": "2026-11-20",
      Origin: "Hamburg (DEHAM)",
      Destination: "Nowhere, Atlantis",
      "Gross weight (kg)": "1250",
    });
    expect(Object.keys(result.extracted)).toEqual([
      "Customer",
      "Trade Direction",
      "Freight Mode",
      "Incoterm",
      "Cargo Readiness Date",
      "Origin",
      "Destination",
      "Gross weight (kg)",
    ]);
    expect(result.fieldCount).toBe(8);
    expect(result.method).toBe("text");
    expect(result.fileName).toBe("(text input)");
  });

  // A quote's origin and destination become the shipment's POL and POD, so the place matcher is
  // asked with the quote page's meaning of them, not with the shipment's "final destination".
  it("asks the place matcher what a quote's places mean", async () => {
    create.mockResolvedValueOnce(reply({ Origin: "Somewhere", Destination: "Nowhere, Atlantis" }));

    await extractFromTextByDestination(TEXT, "quote");

    expect(create).toHaveBeenCalledTimes(2);
    const asked = create.mock.calls[1]![0].messages[0].content as string;
    expect(asked).toContain("origin: port or place the cargo leaves from");
    expect(asked).toContain("destination: port or place the cargo goes to");
    expect(asked).not.toContain("final destination");
  });

  it("reads an image with vision and looks no place up when none was read", async () => {
    create.mockResolvedValueOnce(reply({ "Freight Mode": "air freight", Email: "Jan <jan@acme.cz>" }));

    const result = await extractQuoteFromFile("AAAA", "inquiry.png");

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].messages[0].content[0].type).toBe("image");
    expect(result.extracted).toEqual({ Email: "jan@acme.cz", "Freight Mode": "Air" });
    expect(result.method).toBe("vision");
    expect(result.fieldCount).toBe(2);
    expect(placeLookup).not.toHaveBeenCalled();
  });

  it("reads a PDF from its text, and from its pages when the text gives nothing", async () => {
    pdfText.value = "Please quote 3 pallets of machine parts by air.";
    create.mockResolvedValueOnce(reply({ "Freight Mode": "Air" }));
    const fromText = await extractQuoteFromFile("AAAA", "inquiry.pdf");
    expect(fromText).toMatchObject({ extracted: { "Freight Mode": "Air" }, method: "text", fileName: "inquiry.pdf" });
    expect(create.mock.calls[0]![0].messages[0].content).toContain(pdfText.value);

    create.mockReset();
    pdfText.value = "";
    create.mockResolvedValueOnce(reply({ Incoterm: "DAP" }));
    const fromPages = await extractQuoteFromFile("AAAA", "scan.pdf");
    expect(fromPages).toMatchObject({ extracted: { Incoterm: "DAP" }, method: "vision" });
    expect(create.mock.calls[0]![0].messages[0].content[0].type).toBe("document");
  });

  // The reply is one object; a "[3]" inside a value or a reply wrapped in a list is still that object.
  it("reads a reply whose value holds square brackets, and one wrapped in a list", async () => {
    create.mockResolvedValueOnce(reply({ Customer: "ACME s.r.o.", Pickup: "Hall [3], Street 1, Praha" }));
    expect((await extractFromTextByDestination(TEXT, "quote")).extracted).toEqual({ Customer: "ACME s.r.o.", Pickup: "Hall [3], Street 1, Praha" });

    create.mockResolvedValueOnce(reply([{ Customer: "ACME s.r.o." }]));
    expect((await extractFromTextByDestination(TEXT, "quote")).extracted).toEqual({ Customer: "ACME s.r.o." });
  });

  it("returns nothing for an empty answer and for one that is no JSON", async () => {
    expect(await extractFromTextByDestination(TEXT, "quote")).toMatchObject({ extracted: {}, fieldCount: 0 });
    create.mockResolvedValueOnce(reply("I could not read this."));
    expect(await extractFromTextByDestination(TEXT, "quote")).toMatchObject({ extracted: {}, fieldCount: 0 });
  });

  it("leaves a place as read when the location database cannot be reached", async () => {
    create.mockResolvedValueOnce(reply({ Origin: "DEHAM" }));
    lookup.fails = true;

    const result = await extractFromTextByDestination(TEXT, "quote");

    expect(result.extracted).toEqual({ Origin: "DEHAM" });
  });

  it("does not touch what the shipment reader returns", async () => {
    create.mockResolvedValueOnce(reply({ "Trade Direction": "IMP", "Load Type": "FCL" }));

    const result = await extractFromTextByDestination(TEXT, "shipment");

    const system = create.mock.calls[0]![0].system as string;
    expect(system).toContain(SHIPMENT_PROMPT);
    expect(system).not.toContain(QUOTE_PROMPT);
    expect(result.extracted).toEqual({ "Trade Direction": "IMP", "Load Type": "FCL" });
  });
});
