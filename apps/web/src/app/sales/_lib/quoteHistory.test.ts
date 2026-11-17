import { describe, expect, it } from "vitest";
import { historyRows } from "./quoteHistory";
import type { SalesQuoteData } from "./types";

describe("historyRows", () => {
  it("lists every line of the quote's history, newest first, each with what it records and what it says", () => {
    const data = {
      timeline: [
        { kind: "status", status: "draft", at: "2026-11-10T08:00:00.000Z", userId: "u1", user: "martin@forwarder.cz" },
        { kind: "owner", at: "2026-11-10T09:00:00.000Z", userId: "u2", user: "jana@forwarder.cz", comment: "Quoted by jana@forwarder.cz (was martin@forwarder.cz)" },
        { kind: "validity", at: "2026-11-10T10:00:00.000Z", userId: "u2", comment: "Valid until 2026-11-25" },
        { kind: "status", status: "lost", at: "2026-11-11T08:00:00.000Z", userId: "u2", lostReason: "Pricing: Price too high", comment: " too late " },
        { kind: "shipment", action: "linked", at: "2026-11-12T08:00:00.000Z", user: "System", auto: true, comment: "Shipment CZ00000101 linked" },
      ],
    } as SalesQuoteData;
    expect(historyRows(data)).toEqual([
      { at: "2026-11-12T08:00:00.000Z", what: "Shipment", status: undefined, detail: "Shipment CZ00000101 linked", userId: undefined, user: "System" },
      { at: "2026-11-11T08:00:00.000Z", what: "Status", status: "lost", detail: "Pricing: Price too high · too late", userId: "u2", user: undefined },
      { at: "2026-11-10T10:00:00.000Z", what: "Validity", status: undefined, detail: "Valid until 2026-11-25", userId: "u2", user: undefined },
      { at: "2026-11-10T09:00:00.000Z", what: "Quoted by", status: undefined, detail: "Quoted by jana@forwarder.cz (was martin@forwarder.cz)", userId: "u2", user: "jana@forwarder.cz" },
      { at: "2026-11-10T08:00:00.000Z", what: "Status", status: "draft", detail: "", userId: "u1", user: "martin@forwarder.cz" },
    ]);
  });

  it("reads a line written before kinds existed as a change of status", () => {
    const data = { timeline: [{ status: "quoted", at: "2026-10-01T08:00:00.000Z", user: "You" }] } as SalesQuoteData;
    expect(historyRows(data)).toMatchObject([{ what: "Status", status: "quoted", user: "You" }]);
  });

  it("names the kinds the server writes, and shows one it does not know as it is", () => {
    const at = "2026-11-10T08:00:00.000Z";
    const data = {
      timeline: [
        { kind: "follow_up", at },
        { kind: "road_price", at },
        { kind: "margin_approval", at },
        { kind: "warehouse_inquiry", at },
        { kind: "deleted", at },
        { kind: "toString", at },
      ],
    } as unknown as SalesQuoteData;
    expect(historyRows(data).map((row) => row.what)).toEqual(["toString", "Deleted", "Warehouse", "Margin approved", "Priced from tariff", "Followed up"]);
  });

  it("is empty for a quote with no history, and skips what is no line", () => {
    expect(historyRows({})).toEqual([]);
    expect(historyRows({ timeline: [null, "x", { kind: "status" }] } as unknown as SalesQuoteData)).toEqual([]);
  });
});
