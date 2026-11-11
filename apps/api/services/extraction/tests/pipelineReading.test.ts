import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth: { placeLookup: vi.fn() } }));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn() } }));
vi.mock("../lib/anthropic", () => ({
  MODEL: "test",
  replyText: (response: { content: { text: string }[] }) => response.content.map((block) => block.text).join(""),
  getClient: () => ({ messages: { create } }),
  askAi: (params: unknown) => create(params),
}));

import { classesByPage, classifyPages, extractFromPages } from "../services/extraction.service";
import { SHIPMENT_FIELDS } from "../lib/fields";

const reply = (answer: unknown) => ({ content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) }] });
// The second chunk of a pre-alert: pages 9 to 11 of the upload, sent as pages 1 to 3 of the request.
const chunk = [9, 10, 11].map((pageNum) => ({ pageNum, base64: "cGFnZQ==", mediaType: "application/pdf" }));

beforeEach(() => {
  create.mockReset();
});

describe("classifying a pre-alert's pages", () => {
  it("takes each page's class by the number the reply gives it, not by its place in the list", async () => {
    // The reply leaves page 2 out: page 3 keeps its own type and House B/L number.
    create.mockResolvedValueOnce(reply([{ page: 1, type: "MBL", ref: "" }, { page: 3, type: "hbl", ref: "CHI/BRV/V01035" }]));
    expect(await classifyPages(chunk)).toEqual([
      { page: 9, type: "MBL", ref: "" },
      { page: 10, type: "HBL", ref: "" },
      { page: 11, type: "HBL", ref: "CHI/BRV/V01035" },
    ]);
  });

  it("reads a reply out of order, numbers as text, and the first answer for a page repeated", () => {
    const answer = [
      { page: "3", type: "SKIP" },
      { page: 1, type: "INVOICE", ref: 12345 },
      { page: 3, type: "MBL" },
      { page: 2.5, type: "MBL" },
    ];
    expect(classesByPage(chunk, answer)).toEqual([
      { page: 9, type: "INVOICE", ref: "12345" },
      { page: 10, type: "HBL", ref: "" },
      { page: 11, type: "SKIP", ref: "" },
    ]);
  });

  it("reads every page as a House B/L when the reply names none of them", () => {
    const allHbl = chunk.map((p) => ({ page: p.pageNum, type: "HBL", ref: "" }));
    expect(classesByPage(chunk, null)).toEqual(allHbl);
    expect(classesByPage(chunk, { page: 1, type: "MBL" })).toEqual(allHbl);
    // Entries without a page number name no page: they are not matched up by their place either.
    expect(classesByPage(chunk, [{ type: "MBL" }, { type: "MBL" }, { type: 7 }])).toEqual(allHbl);
  });
});

describe("reading one House B/L or Master B/L from its pages", () => {
  const read = () => extractFromPages(chunk, "prompt", "Return one JSON object.", SHIPMENT_FIELDS, 4096);

  it("reads the reply as one object, even when a value holds square brackets", async () => {
    // "[3]" is a JSON list of its own: read list-first, the reply was a shipment with nothing in it.
    create.mockResolvedValueOnce(reply({ Shipper: "ACME", "Seal Number": "[3]" }));
    expect(await read()).toEqual({ Shipper: "ACME", "Seal Number": "[3]" });
  });

  it("takes the first object of a reply that split the document into a list", async () => {
    create.mockResolvedValueOnce(reply([{ Shipper: "ACME", "Personal Reference": "H1" }, { Shipper: "ACME" }]));
    expect(await read()).toEqual({ Shipper: "ACME", "Personal Reference": "H1" });
  });

  it("reads nothing from an empty object, one with none of the fields, or a reply with no JSON", async () => {
    create.mockResolvedValueOnce(reply({})).mockResolvedValueOnce(reply({ Unknown: "x", Shipper: " " })).mockResolvedValueOnce(reply("I cannot read these pages."));
    expect(await read()).toBeNull();
    expect(await read()).toBeNull();
    expect(await read()).toBeNull();
  });
});
