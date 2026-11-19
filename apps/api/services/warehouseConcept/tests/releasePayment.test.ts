import { describe, expect, it, vi } from "vitest";

// Pure: no Encore runtime needed (what can't be asked is logged, not thrown).
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", async () => {
  const fakes = await import("./shipmentFakes");
  return { invoicing: fakes.invoicingFake, shipments: fakes.releasePassFakes };
});

import {
  NOT_INVOICED,
  gateOverrideEvent,
  gatePassOverride,
  gateReleasePass,
  gateReleaseStop,
  giveBackPass,
  recordOnShipment,
  type GateReleaseOverride,
} from "../services/releasePayment";
import { passesGivenBack, releasePasses, shipmentOverrides } from "./shipmentFakes";

const unpaid = { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] };

describe("the prepayment stop at the gate's WH release", () => {
  it("never stops a job that is not on unpaid prepayment, and records no reason sent with it", () => {
    expect(gateReleaseStop({ prepaymentUnpaid: false, unpaid: [] }, "user", undefined)).toEqual({ override: null });
    expect(gateReleaseStop({ prepaymentUnpaid: false, unpaid: unpaid.unpaid }, "manager", "a reason")).toEqual({ override: null });
  });

  it("refuses a plain user, naming the invoices, in the shipments' words", () => {
    expect(gateReleaseStop(unpaid, "user", "please")).toEqual({
      refusal: "The WH release can't be stamped: the job is on prepayment and not paid - FV2026001 (1,200.00 EUR left to pay). A manager can release it with a reason",
    });
  });

  it("lets a manager, an admin or a superadmin out with a reason of at least 3 characters", () => {
    expect(gateReleaseStop(unpaid, "manager", " ok ")).toMatchObject({ refusal: expect.stringMatching(/give a reason \(at least 3 characters\)$/) });
    expect(gateReleaseStop(unpaid, "admin", "Paid in cash")).toEqual({
      override: { reason: "Paid in cash", invoices: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }], checked: true },
    });
    expect(gateReleaseStop(unpaid, "superadmin", "Paid in cash")).toMatchObject({ override: { checked: true } });
  });

  it("names only the prepayment invoices when Invoicing gives them", () => {
    const check = { ...unpaid, unpaid: [...unpaid.unpaid, { number: "FV2026002", leftToPay: 50, currency: "EUR" }], prepaymentInvoices: unpaid.unpaid };
    expect(gateReleaseStop(check, "manager", "Paid in cash")).toMatchObject({ override: { invoices: [{ number: "FV2026001" }] } });
  });

  it("refuses when Invoicing could not be asked, and a manager's reason lets it out unchecked", () => {
    expect(gateReleaseStop(null, "user", undefined)).toEqual({
      refusal: "Whether the job is paid could not be checked: try again in a moment. A manager can release it with a reason",
    });
    expect(gateReleaseStop(null, "manager", "Bank is slow")).toEqual({ override: { reason: "Bank is slow", invoices: [], checked: false } });
  });

  it("leaves a line in the record's history as the shipment's override line reads", () => {
    const at = "2026-11-19T10:00:00.000Z";
    expect(gateOverrideEvent({ reason: "Paid in cash", invoices: unpaid.unpaid, checked: true }, at, "Jana")).toEqual({
      kind: "paymentOverride",
      label: "WH release on prepayment (unpaid: FV2026001 (1,200.00 EUR left to pay)) - reason: Paid in cash",
      at,
      by: "Jana",
    });
    expect(gateOverrideEvent({ reason: "Bank is slow", invoices: [], checked: false }, at, "Jana").label).toBe("WH release on prepayment (payment not checked) - reason: Bank is slow");
  });
});

describe("the not-invoiced lines (mock test council L3)", () => {
  const uninvoiced = { prepaymentUnpaid: true, unpaid: [], prepaymentUninvoiced: [{ currency: "EUR", amount: 800 }, { currency: "CZK", amount: 12500 }] };

  it("say the job is not invoiced and paid yet when nothing is invoiced on prepayment, naming the amounts", () => {
    expect(gateReleaseStop(uninvoiced, "user", undefined)).toEqual({
      refusal:
        "The WH release can't be stamped: the job is on prepayment and not invoiced and paid yet - 800.00 EUR not invoiced yet, 12,500.00 CZK not invoiced yet. A manager can release it with a reason",
    });
  });

  it("say not paid when an invoice is left to pay beside the work not invoiced, naming both", () => {
    const both = { ...uninvoiced, unpaid: unpaid.unpaid, prepaymentInvoices: unpaid.unpaid };
    expect(gateReleaseStop(both, "user", undefined)).toEqual({
      refusal:
        "The WH release can't be stamped: the job is on prepayment and not paid - FV2026001 (1,200.00 EUR left to pay), 800.00 EUR not invoiced yet, 12,500.00 CZK not invoiced yet. A manager can release it with a reason",
    });
  });

  it("are recorded with a manager's override as invoice lines, and the record's line names them", () => {
    const verdict = gateReleaseStop(uninvoiced, "manager", "Paid in cash");
    expect(verdict).toEqual({
      override: {
        reason: "Paid in cash",
        invoices: [
          { number: NOT_INVOICED, leftToPay: 800, currency: "EUR" },
          { number: NOT_INVOICED, leftToPay: 12500, currency: "CZK" },
        ],
        checked: true,
      },
    });
    const override = (verdict as { override: GateReleaseOverride }).override;
    expect(gateOverrideEvent(override, "2026-11-19T10:00:00.000Z", "Jana").label).toBe(
      "WH release on prepayment (not invoiced: 800.00 EUR not invoiced yet, 12,500.00 CZK not invoiced yet) - reason: Paid in cash",
    );
  });
});

describe("a release a manager approved on request, at the gate", () => {
  const pass = { requestId: "req-1", reason: "Asked by Jan Novák: customer pays on Friday — approved by Eva Malá: agreed", usedAt: "2026-11-19T10:00:00.000Z" };

  it("stands for the override the stop would refuse, with who asked and who approved as its reason", () => {
    expect(gatePassOverride(unpaid, pass)).toEqual({
      reason: pass.reason,
      invoices: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }],
      checked: true,
      pass: { requestId: "req-1", usedAt: pass.usedAt },
    });
    expect(gatePassOverride(null, pass)).toMatchObject({ invoices: [], checked: false });
  });

  it("is used in Shipments for the job's Warehouse Released; none, or Shipments not answering, leaves the refusal standing", async () => {
    releasePasses.set("job-1", { requestId: "req-1", reason: pass.reason });
    await expect(gateReleasePass("job-1", unpaid)).resolves.toMatchObject({ reason: pass.reason, pass: { requestId: "req-1" } });
    // Used once: the next release finds none.
    await expect(gateReleasePass("job-1", unpaid)).resolves.toBeNull();
    releasePasses.set("job-2", new Error("shipments down"));
    await expect(gateReleasePass("job-2", unpaid)).resolves.toBeNull();
    releasePasses.delete("job-2");
  });

  it("is given back only when one was used, and recording on the shipment never throws", async () => {
    passesGivenBack.length = 0;
    shipmentOverrides.length = 0;
    await giveBackPass(null);
    await giveBackPass({ reason: "Paid in cash", invoices: [], checked: true });
    expect(passesGivenBack).toEqual([]);
    await giveBackPass(gatePassOverride(unpaid, pass));
    expect(passesGivenBack).toEqual([{ requestId: "req-1", usedAt: pass.usedAt }]);

    await recordOnShipment("job-1", gatePassOverride(unpaid, pass));
    expect(shipmentOverrides).toEqual([
      { shipmentId: "job-1", kind: "warehouse_released", reason: pass.reason, invoices: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }], checked: true },
    ]);
  });
});
