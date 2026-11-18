import { describe, expect, it } from "vitest";
import { overrideLine, PAYMENT_UNCHECKED, prepaymentStop, setsWarehouseRelease } from "../lib/prepaymentStop";

// The prepayment stop (Accounts Receivable step 7): who may release a job on prepayment that is not paid.
const UNPAID = {
  prepaymentUnpaid: true,
  unpaid: [
    { number: "FV2026-0012", leftToPay: 1200, currency: "EUR" },
    { number: "FV2026-0013", leftToPay: 15000.5, currency: "CZK" },
  ],
};
const PAID = { prepaymentUnpaid: false, unpaid: [{ number: "FV2026-0014", leftToPay: 300, currency: "EUR" }] };

describe("prepaymentStop", () => {
  it("never stops a job that is not on unpaid prepayment, whoever asks, and records no reason", () => {
    for (const role of ["user", "manager", "admin", "superadmin"]) {
      expect(prepaymentStop("warehouse_released", PAID, role, "a reason")).toEqual({ override: null });
      expect(prepaymentStop("house_bol", { prepaymentUnpaid: false, unpaid: [] }, role, undefined)).toEqual({ override: null });
    }
  });

  it("refuses a user, naming every invoice left to pay, a reason or not", () => {
    for (const reason of [undefined, "Paid by phone"]) {
      expect(prepaymentStop("house_bol", UNPAID, "user", reason)).toEqual({
        refusal:
          "The House BoL can't be released: the job is on prepayment and not paid - FV2026-0012 (1,200.00 EUR left to pay), FV2026-0013 (15,000.50 CZK left to pay). A manager can release it with a reason",
      });
    }
  });

  it("refuses a manager without a reason of at least 3 characters, and lets one with it through", () => {
    for (const reason of [undefined, "", "   ", "ab", " ab "]) {
      const verdict = prepaymentStop("warehouse_released", UNPAID, "manager", reason);
      expect(verdict).toEqual({ refusal: expect.stringMatching(/^Warehouse Released can't be set: .*give a reason \(at least 3 characters\)$/) });
    }
    expect(prepaymentStop("warehouse_released", UNPAID, "superadmin", "  abc ")).toEqual({
      override: {
        reason: "abc",
        invoices: [
          { number: "FV2026-0012", leftToPay: 1200, currency: "EUR" },
          { number: "FV2026-0013", leftToPay: 15000.5, currency: "CZK" },
        ],
        checked: true,
      },
    });
  });

  it("refuses when Invoicing could not be asked, and lets a manager with a reason through, unchecked", () => {
    expect(prepaymentStop("house_bol", null, "user", "whatever")).toEqual({ refusal: `${PAYMENT_UNCHECKED}. A manager can release it with a reason` });
    expect(prepaymentStop("house_bol", null, "manager", undefined)).toEqual({ refusal: expect.stringContaining(PAYMENT_UNCHECKED) });
    expect(prepaymentStop("house_bol", null, "admin", "Cash at the counter")).toEqual({ override: { reason: "Cash at the counter", invoices: [], checked: false } });
  });
});

describe("setsWarehouseRelease", () => {
  it("is a date written into an empty Warehouse Released, nothing else", () => {
    expect(setsWarehouseRelease({ warehouseReleasedDate: null }, { warehouseReleasedDate: "2026-11-18" })).toBe(true);
    expect(setsWarehouseRelease({ warehouseReleasedDate: "" }, { warehouseReleasedDate: " 2026-11-18 " })).toBe(true);
    expect(setsWarehouseRelease({ warehouseReleasedDate: null }, {})).toBe(false);
    expect(setsWarehouseRelease({ warehouseReleasedDate: null }, { warehouseReleasedDate: "" })).toBe(false);
    expect(setsWarehouseRelease({ warehouseReleasedDate: null }, { warehouseReleasedDate: null })).toBe(false);
    expect(setsWarehouseRelease({ warehouseReleasedDate: "2026-11-17" }, { warehouseReleasedDate: "2026-11-18" })).toBe(false);
    expect(setsWarehouseRelease({ warehouseReleasedDate: "2026-11-17" }, { warehouseReleasedDate: null })).toBe(false);
  });
});

describe("overrideLine", () => {
  it("says what was released, on what and why", () => {
    expect(overrideLine("house_bol", { reason: "Bank guarantee", invoices: [UNPAID.unpaid[0]!], checked: true })).toBe(
      "House BoL released on prepayment (unpaid: FV2026-0012 (1,200.00 EUR left to pay)) - reason: Bank guarantee",
    );
    expect(overrideLine("warehouse_released", { reason: "Cash", invoices: [], checked: false })).toBe("Warehouse Released set on prepayment (payment not checked) - reason: Cash");
  });
});
