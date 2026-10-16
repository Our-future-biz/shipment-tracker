import { describe, expect, it, vi } from "vitest";

// Haulier invoice rules: exact match only, the VAT bank-account block, the estimate-like split of
// the real cost, and the checks of an invoice as entered.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { bankAccountCheck, cleanInvoiceInput, cleanReason, invoiceBlockReasons, invoiceNumberKey, matchInvoice, splitLike, type VatProfile } from "../lib/haulierInvoiceRules";
import { realCosts, type RealTarget } from "../lib/haulierInvoiceReal";
import type { PriceSnapshot } from "../interfaces/interfaces";

const ACCOUNT = "19-2000145399/0800";
const ok: VatProfile = { vatUnreliable: false, bankAccountPublished: true, bankAccounts: [ACCOUNT], blocked: false, blockReason: "", vatCheckedAt: "2026-10-01" };

describe("exact match", () => {
  it("approves automatically when every line and the net total match to the cent", () => {
    const r = matchInvoice(15000.1, [{ expected: 10000, invoiced: 10000 }, { expected: 5000.1, invoiced: 5000.1 }], []);
    expect(r).toEqual({ status: "APPROVED", lineDifferences: [0, 0], difference: 0, mismatches: [] });
  });

  it("needs approval for any difference, even one cent", () => {
    const r = matchInvoice(10000.01, [{ expected: 10000, invoiced: 10000.01 }], []);
    expect(r.status).toBe("NEEDS_APPROVAL");
    expect(r.lineDifferences).toEqual([0.01]);
    expect(r.difference).toBe(0.01);
    expect(r.mismatches).toEqual(["Line 1: invoiced more than expected by 0.01"]);
  });

  it("needs approval when the net total is not the sum of exact lines", () => {
    const r = matchInvoice(10100, [{ expected: 10000, invoiced: 10000 }], []);
    expect(r).toMatchObject({ status: "NEEDS_APPROVAL", lineDifferences: [0], difference: 100 });
    expect(r.mismatches[0]).toMatch(/net total 10100.00 is not the sum of the lines 10000.00/);
  });

  it("is BLOCKED whatever the match while there is a block reason; DRAFT without lines", () => {
    expect(matchInvoice(100, [{ expected: 100, invoiced: 100 }], ["x"]).status).toBe("BLOCKED");
    expect(matchInvoice(0, [], []).status).toBe("DRAFT");
  });
});

describe("VAT bank-account check (ručení za DPH)", () => {
  it("passes a reliable payer paid into a published account, whatever its spelling", () => {
    expect(invoiceBlockReasons(ok, "CZ65 0800 0000 1920 0014 5399")).toEqual([]);
    expect(bankAccountCheck(ok, ACCOUNT)).toMatchObject({ published: true, checkedAt: "2026-10-01" });
  });

  it("blocks an unreliable payer, an unpublished account, an account not listed and a blocked haulier - saying why", () => {
    expect(invoiceBlockReasons({ ...ok, vatUnreliable: true }, ACCOUNT)).toEqual([expect.stringMatching(/unreliable VAT payer/)]);
    expect(invoiceBlockReasons({ ...ok, bankAccountPublished: false }, ACCOUNT)).toEqual([expect.stringMatching(/not marked as published/)]);
    expect(invoiceBlockReasons(ok, "2000145399/0800")).toEqual([expect.stringMatching(/2000145399\/0800 is not one of the haulier's accounts/)]);
    expect(invoiceBlockReasons({ ...ok, blocked: true, blockReason: "Cargo damaged" }, ACCOUNT)).toEqual(["The haulier is blocked: Cargo damaged"]);
    expect(invoiceBlockReasons({ ...ok, vatUnreliable: true, bankAccounts: [] }, ACCOUNT)).toHaveLength(2);
    expect(invoiceBlockReasons(null, ACCOUNT)).toEqual([expect.stringMatching(/no trucking profile/)]);
    expect(bankAccountCheck(ok, "2000145399/0800").published).toBe(false);
    expect(bankAccountCheck(null, ACCOUNT).published).toBeNull();
  });
});

describe("invoice as entered", () => {
  const T = "00000000-0000-0000-0000-0000000000f1";
  const base = {
    invoiceNumber: " FV 2026/12 ",
    issueDate: "2026-10-10",
    dueDate: "2026-11-09",
    duzp: "2026-10-09",
    currency: "CZK" as const,
    totalNet: 1000,
    vatAmount: 210,
    totalGross: 1210,
    bankAccount: "CZ65 0800 0000 1920 0014 5399",
    lines: [{ targetKind: "TRIP" as const, targetId: T, invoiced: 1000.004, note: " ok " }],
  };

  it("trims the number, keys it for duplicates, normalises the account and rounds amounts to cents", () => {
    const c = cleanInvoiceInput(base);
    expect(c).toMatchObject({ invoiceNumber: "FV 2026/12", invoiceNumberKey: "FV2026/12", bankAccount: ACCOUNT, lines: [{ invoiced: 1000, note: "ok" }] });
    expect(invoiceNumberKey("fv 2026/12")).toBe("FV2026/12");
  });

  it("refuses a missing number, a bad account, a bad date, a target listed twice", () => {
    expect(() => cleanInvoiceInput({ ...base, invoiceNumber: " " })).toThrow(/number is required/);
    expect(() => cleanInvoiceInput({ ...base, bankAccount: "123" })).toThrow(/bank account/);
    expect(() => cleanInvoiceInput({ ...base, issueDate: "2026-02-30" })).toThrow(/issue date/);
    expect(() => cleanInvoiceInput({ ...base, dueDate: "2026-10-01" })).toThrow(/before the issue date/);
    expect(() => cleanInvoiceInput({ ...base, lines: [base.lines[0]!, base.lines[0]!] })).toThrow(/listed twice/);
    expect(() => cleanInvoiceInput({ ...base, lines: [{ ...base.lines[0]!, targetId: "x" }] })).toThrow(/Line 1/);
  });

  it("wants a reason of 3 to 500 characters", () => {
    expect(cleanReason(" Fuel went up ", "approval")).toBe("Fuel went up");
    expect(() => cleanReason("ok", "approval")).toThrow();
    expect(() => cleanReason("x".repeat(501), "rejection")).toThrow();
  });
});

const snapshot = (amounts: number[], currency: "CZK" | "EUR" = "CZK"): PriceSnapshot => ({
  source: "TARIFF",
  tariffId: null,
  tariffVersionId: null,
  versionNo: null,
  tariffName: "Buy",
  serviceLevel: null,
  currency,
  total: amounts.reduce((a, b) => a + b, 0),
  totalCzk: amounts.reduce((a, b) => a + b, 0),
  lines: amounts.map((amount, i) => ({ code: `L${i}`, label: `Line ${i}`, qty: 1, unit: "trip", unitPrice: amount, amount })),
  ratedAt: "2026-10-01T00:00:00Z",
  overrideReason: null,
});

describe("the real cost reaches the jobs like the estimate", () => {
  it("splits like the weights to the cent (largest remainder), all on the first part when it cannot", () => {
    expect(splitLike(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    expect(splitLike(1000.01, [600, 400])).toEqual([600.01, 400]);
    expect(splitLike(50, [0, 0])).toEqual([50, 0]);
    expect(splitLike(50, [-10, 60])).toEqual([50, 0]);
  });

  const TRIP = "00000000-0000-0000-0000-0000000000f1";
  const S1 = "00000000-0000-0000-0000-0000000000d1";
  const S2 = "00000000-0000-0000-0000-0000000000d2";
  const S3 = "00000000-0000-0000-0000-0000000000d3";

  it("an FTL trip: the job's trip rows, over the price lines like their amounts", () => {
    const t: RealTarget = { kind: "TRIP", id: TRIP, tripKind: "FTL", ref: "LCZ2026000001", buy: snapshot([9000, 1000]), jobs: [{ shipmentId: S1, consignmentId: "c1", weight: 1 }] };
    const { allocations, pushes } = realCosts(t, 10500, "CZK", "FV1", () => false);
    expect(pushes).toEqual([
      {
        shipmentId: S1,
        consignmentId: "c1",
        payload: {
          sourceRef: `trucking:trip:${TRIP}`,
          realLines: [
            { description: "LCZ2026000001 · Line 0", amount: 9450, currency: "CZK", invoiceNumber: "FV1" },
            { description: "LCZ2026000001 · Line 1", amount: 1050, currency: "CZK", invoiceNumber: "FV1" },
          ],
        },
      },
    ]);
    expect(allocations).toEqual([{ shipmentId: S1, sourceRef: `trucking:trip:${TRIP}`, amount: 10500, currency: "CZK", internal: false }]);
  });

  it("an LTL trip: one row per Road job, split like the estimate's job shares (largest remainder)", () => {
    // Estimate shares 333.33 / 333.33 / 333.34 of 1000; the invoice says 1000.01.
    const t: RealTarget = {
      kind: "TRIP",
      id: TRIP,
      tripKind: "PICKUP_RUN",
      ref: "LCZ2026000002",
      buy: snapshot([1000]),
      jobs: [
        { shipmentId: S1, consignmentId: "c1", weight: 333.33 },
        { shipmentId: S2, consignmentId: "c2", weight: 333.33 },
        { shipmentId: S3, consignmentId: "c3", weight: 333.34 },
      ],
    };
    const { allocations, pushes } = realCosts(t, 1000.01, "CZK", "FV1", () => false);
    expect(allocations.map((a) => a.amount)).toEqual([333.33, 333.33, 333.35]);
    expect(allocations.reduce((a, x) => a + Math.round(x.amount * 100), 0)).toBe(100001);
    expect(pushes.map((p) => p.payload.sourceRef)).toEqual([S1, S2, S3].map((s) => `trucking:trip:${TRIP}:job:${s}`));
    // An exact invoice reproduces the estimate split exactly.
    expect(realCosts(t, 1000, "CZK", "FV1", () => false).allocations.map((a) => a.amount)).toEqual([333.33, 333.33, 333.34]);
  });

  it("internal jobs get no line: their part stays in Trucking's ledger", () => {
    const t: RealTarget = {
      kind: "TRIP",
      id: TRIP,
      tripKind: "DELIVERY_RUN",
      ref: "LCZ2026000003",
      buy: snapshot([900]),
      jobs: [
        { shipmentId: S1, consignmentId: "c1", weight: 600 },
        { shipmentId: S2, consignmentId: "c2", weight: 300 },
      ],
    };
    const { allocations, pushes } = realCosts(t, 900, "CZK", "FV1", (s) => s === S2);
    expect(pushes.map((p) => p.shipmentId)).toEqual([S1]);
    expect(allocations).toEqual([
      expect.objectContaining({ shipmentId: S1, amount: 600, internal: false }),
      expect.objectContaining({ shipmentId: S2, amount: 300, internal: true }),
    ]);
    const leg: RealTarget = { kind: "PARTNER_LEG", id: "l1", tripKind: null, ref: "TCZ2026000002 partner delivery", buy: snapshot([800], "EUR"), jobs: [{ shipmentId: S2, consignmentId: "c2", weight: 1 }] };
    expect(realCosts(leg, 800, "EUR", "FV1", () => true).pushes).toEqual([]);
    expect(realCosts(leg, 800, "EUR", "FV1", () => false).pushes[0]!.payload).toEqual({ sourceRef: "trucking:leg:l1", realLines: [{ description: "TCZ2026000002 partner delivery · Line 0", amount: 800, currency: "EUR", invoiceNumber: "FV1" }] });
  });
});
