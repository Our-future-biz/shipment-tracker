import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROTECTED_KEYS,
  carryKeys,
  isPlainObject,
  newDocument,
  ratesNeeded,
  ratesToStamp,
  stripProtected,
} from "../../utils/quoteDocument.utils";

describe("isPlainObject", () => {
  it("is true only for JSON objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(7)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

describe("stripProtected", () => {
  it("drops every key only the server writes and keeps the rest", () => {
    const doc = {
      reference: "QCZ20261010009",
      quoteStatus: "won",
      substatus: "Negotiation",
      lostReason: "x",
      lostComment: "y",
      sentAt: "2026-10-10T10:00:00.000Z",
      decidedAt: "2026-10-10T10:00:00.000Z",
      validUntil: "2026-10-25",
      validityDays: 15,
      winProbability: 100,
      timeline: [{ status: "won" }],
      salesOwner: "Somebody Else",
      lifecycleUnreadable: { sentAt: "yesterday" },
      timelineUnreadable: "abc",
      customerName: "ACME",
      sellingLines: [{ type: "Ocean freight", currency: "EUR", amount: 100 }],
      Shipper: "old-module field",
    };
    expect(stripProtected(doc)).toEqual({
      customerName: "ACME",
      sellingLines: [{ type: "Ocean freight", currency: "EUR", amount: 100 }],
      Shipper: "old-module field",
    });
  });

  it("does not touch the document it was given", () => {
    const doc = { quoteStatus: "won", origin: "Praha" };
    stripProtected(doc);
    expect(doc).toEqual({ quoteStatus: "won", origin: "Praha" });
  });
});

describe("newDocument", () => {
  const lifecycle = {
    quoteStatus: "draft",
    winProbability: 10,
    salesOwner: "Martin",
    timeline: [{ kind: "status", status: "draft", at: "2026-10-10T10:00:00.000Z", user: "Martin", userId: "user-1" }],
  };

  it("is the caller's fields, the assigned reference and the first lifecycle", () => {
    expect(newDocument("QCZ20261010005", { customerName: "ACME", origin: "Praha" }, lifecycle)).toEqual({
      method: "manual",
      customerName: "ACME",
      origin: "Praha",
      reference: "QCZ20261010005",
      ...lifecycle,
    });
  });

  it("needs no fields at all", () => {
    expect(newDocument("QCZ20261010005", {}, lifecycle)).toEqual({ method: "manual", reference: "QCZ20261010005", ...lifecycle });
  });

  it("keeps the method the caller names", () => {
    expect(newDocument("QCZ20261010005", { method: "email" }, lifecycle).method).toBe("email");
  });

  it("ignores every lifecycle key the caller sends: a copy does not inherit status, owner or history", () => {
    const copied = {
      reference: "QCZ20261010001",
      quoteStatus: "won",
      winProbability: 100,
      salesOwner: "Jana",
      sentAt: "2026-10-01T08:00:00.000Z",
      decidedAt: "2026-10-05T08:00:00.000Z",
      validUntil: "2026-10-16",
      lostReason: "Pricing: Price too high",
      timeline: [{ status: "won", at: "2026-10-05T08:00:00.000Z", user: "Jana" }],
      customerName: "ACME",
    };
    expect(newDocument("QCZ20261010001-2", copied, lifecycle)).toEqual({
      method: "manual",
      customerName: "ACME",
      reference: "QCZ20261010001-2",
      ...lifecycle,
    });
  });
});

describe("carryKeys", () => {
  it("carries the protected keys over, and no key of the editor's", () => {
    expect(carryKeys()).toEqual([...PROTECTED_KEYS]);
  });

  it("returns a list the caller may change", () => {
    carryKeys().push("x");
    expect(carryKeys()).not.toContain("x");
  });
});

describe("PROTECTED_KEYS", () => {
  const webTypes = () =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../web/src/app/sales/_lib/types.ts"), "utf8");

  it("name no key twice", () => {
    expect(new Set(PROTECTED_KEYS).size).toBe(PROTECTED_KEYS.length);
  });

  /**
   * The web keeps its own list of the protected keys: it drops them from what the user edits
   * and takes them over from every answer of the server. The two lists must be the same.
   */
  it("protect the same keys as the web's PROTECTED_KEYS", () => {
    const list = webTypes().match(/export const PROTECTED_KEYS = \[([^\]]*)\]/);
    expect(list, "PROTECTED_KEYS not found in types.ts").not.toBeNull();
    expect([...list![1]!.matchAll(/"(\w+)"/g)].map((m) => m[1])).toEqual([...PROTECTED_KEYS]);
  });
});

describe("ratesNeeded", () => {
  it("needs no rate when every line is in the quote's currency", () => {
    expect(ratesNeeded({ currency: "EUR", sellingLines: [{ currency: "EUR", amount: 100 }] })).toEqual([]);
    // A quote without a currency is in EUR; a line without one is in the quote's.
    expect(ratesNeeded({ sellingLines: [{ amount: 100 }, { currency: "EUR", amount: 5 }] })).toEqual([]);
    expect(ratesNeeded({})).toEqual([]);
  });

  it("needs the rate of the line and of the quote: conversion goes through CZK", () => {
    expect(ratesNeeded({ currency: "EUR", sellingLines: [{ currency: "USD", amount: 100 }] })).toEqual(["EUR", "USD"]);
    expect(ratesNeeded({ buyingLines: [{ currency: "GBP", amount: 100 }], sellingLines: [{ currency: "USD", amount: 1 }] })).toEqual(["EUR", "GBP", "USD"]);
  });

  it("never needs a rate for CZK", () => {
    expect(ratesNeeded({ currency: "CZK", sellingLines: [{ currency: "USD", amount: 100 }] })).toEqual(["USD"]);
    expect(ratesNeeded({ currency: "EUR", buyingLines: [{ currency: "CZK", amount: 100 }] })).toEqual(["EUR"]);
  });

  it("survives a document that is not shaped as expected", () => {
    expect(ratesNeeded({ currency: 7, sellingLines: "abc", buyingLines: [null, 5, "x", { currency: 9 }, { currency: "USD" }] })).toEqual(["EUR", "USD"]);
  });
});

describe("ratesToStamp", () => {
  const exchange = { rates: { CZK: 1, EUR: 25.1, USD: 23.4 }, week: "2026-W41" };
  const doc = { currency: "EUR", sellingLines: [{ currency: "USD", amount: 100 }] };

  it("takes the sheet's rate for every currency the quote converts and stores none for", () => {
    expect(ratesToStamp(doc, exchange)).toEqual({
      EUR: { rate: 25.1, week: "2026-W41" },
      USD: { rate: 23.4, week: "2026-W41" },
    });
  });

  it("never replaces a rate the quote already stores", () => {
    const withRate = { ...doc, rates: { USD: { rate: 22 } } };
    expect(ratesToStamp(withRate, exchange)).toEqual({ USD: { rate: 22 }, EUR: { rate: 25.1, week: "2026-W41" } });
  });

  it("is null when there is nothing to store", () => {
    expect(ratesToStamp({ currency: "EUR", sellingLines: [{ currency: "EUR", amount: 1 }] }, exchange)).toBeNull();
    expect(ratesToStamp({ ...doc, rates: { EUR: { rate: 25 }, USD: { rate: 23 } } }, exchange)).toBeNull();
    // A currency the sheet does not carry is left without a rate.
    expect(ratesToStamp({ currency: "CZK", sellingLines: [{ currency: "GBP", amount: 1 }] }, exchange)).toBeNull();
  });

  it("does not store rates of currencies the quote does not convert", () => {
    expect(ratesToStamp({ currency: "CZK", sellingLines: [{ currency: "USD", amount: 1 }] }, exchange)).toEqual({
      USD: { rate: 23.4, week: "2026-W41" },
    });
  });

  it("takes only a usable rate", () => {
    expect(ratesToStamp(doc, { rates: { EUR: 0, USD: Number.NaN }, week: "2026-W41" })).toBeNull();
    expect(ratesToStamp(doc, { rates: { EUR: -1, USD: Number.POSITIVE_INFINITY } })).toBeNull();
  });

  it("leaves the week out when the caller names none", () => {
    expect(ratesToStamp(doc, { rates: { EUR: 25.1, USD: 23.4 } })).toEqual({ EUR: { rate: 25.1 }, USD: { rate: 23.4 } });
  });

  it("starts afresh when the stored rates are not an object", () => {
    expect(ratesToStamp({ ...doc, rates: "abc" }, exchange)).toEqual({
      EUR: { rate: 25.1, week: "2026-W41" },
      USD: { rate: 23.4, week: "2026-W41" },
    });
  });
});
