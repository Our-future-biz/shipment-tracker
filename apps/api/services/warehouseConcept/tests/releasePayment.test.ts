import { describe, expect, it, vi } from "vitest";

// Pure: no Encore runtime needed (what can't be asked is logged, not thrown).
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", async () => {
  const fakes = await import("./shipmentFakes");
  return { invoicing: fakes.invoicingFake, shipments: { ...fakes.releasePassFakes, ...fakes.shipmentBasicsFake }, customers: fakes.customersFake };
});

import {
  NOT_INVOICED,
  customerOnPrepayment,
  gateOverrideEvent,
  gatePassOverride,
  gateReleasePass,
  gateReleaseStop,
  gateReleaseVerdict,
  giveBackPass,
  isPrepaymentTerms,
  isUncheckedPayload,
  overrideOfPayload,
  overrideOutboxPayload,
  passBackOfPayload,
  passBackPayload,
  paymentUncheckedEvent,
  releasedInShipments,
  releasedInShipmentsEvent,
  releasedPayloadToSend,
  uncheckedOutboxPayload,
  type GateReleaseOverride,
} from "../services/releasePayment";
import { mayNeedCorrectingDetail } from "../services/voidNotice";
import {
  customerTermsOf,
  gateDaysAsked,
  jobsWithNoCustomer,
  passesGivenBack,
  passesNotGivenBack,
  releaseChecks,
  releasedInShipmentsOf,
  releasePasses,
} from "./shipmentFakes";

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
    await expect(gateReleasePass("job-1", unpaid)).resolves.toMatchObject({ override: { reason: pass.reason, pass: { requestId: "req-1" } }, released: null });
    // Used once: the next release finds none.
    await expect(gateReleasePass("job-1", unpaid)).resolves.toEqual({ override: null, released: null });
    releasePasses.set("job-2", new Error("shipments down"));
    await expect(gateReleasePass("job-2", unpaid)).resolves.toBeNull();
    releasePasses.delete("job-2");
  });

  it("is not used for a job released in Shipments meanwhile: that is answered instead (Y6)", async () => {
    releasePasses.set("job-3", { requestId: "req-3", reason: pass.reason });
    releasedInShipmentsOf.set("job-3", { date: "2026-11-18", by: "eva@firma.cz" });
    try {
      await expect(gateReleasePass("job-3", unpaid)).resolves.toEqual({ override: null, released: { date: "2026-11-18", by: "eva@firma.cz" } });
      expect(releasePasses.has("job-3")).toBe(true);
    } finally {
      releasePasses.delete("job-3");
      releasedInShipmentsOf.delete("job-3");
    }
  });

  it("is given back at once only when one was used (the outbox's fallback)", async () => {
    passesGivenBack.length = 0;
    await giveBackPass(null);
    await giveBackPass({ reason: "Paid in cash", invoices: [], checked: true });
    expect(passesGivenBack).toEqual([]);
    await giveBackPass(gatePassOverride(unpaid, pass));
    expect(passesGivenBack).toEqual([{ requestId: "req-1", usedAt: pass.usedAt }]);
  });
});

describe("what the gate's outbox sends Shipments of a release on prepayment (n27)", () => {
  const override = { reason: "Paid in cash", invoices: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }], checked: false, pass: { requestId: "req-1", usedAt: "2026-11-19T10:00:00.000Z" } };

  it("carries the override as strings, and reads back as Shipments records it", () => {
    const payload = overrideOutboxPayload(override);
    expect(Object.values(payload).every((v) => typeof v === "string")).toBe(true);
    expect(overrideOfPayload(payload)).toEqual({ reason: "Paid in cash", invoices: override.invoices, checked: false });
    // A broken invoice list is recorded without the invoices rather than not at all.
    expect(overrideOfPayload({ reason: "x", invoices: "{oops", checked: "true" })).toEqual({ reason: "x", invoices: [], checked: true });
    expect(overrideOfPayload({ reason: "x", invoices: '[{"number":1}]', checked: "true" }).invoices).toEqual([]);
  });

  it("carries an approval to give back only when the release used one", () => {
    expect(passBackPayload(null)).toBeNull();
    expect(passBackPayload({ reason: "x", invoices: [], checked: true })).toBeNull();
    // Matched in Shipments by the moment alone: "Send again" may send it as the service identity.
    expect(passBackOfPayload(passBackPayload(override)!)).toEqual({ requestId: "req-1", usedAt: "2026-11-19T10:00:00.000Z", byMomentOnly: true });
  });

  it("marks the \"Prepayment not checked\" line apart from an override (P17)", () => {
    expect(isUncheckedPayload(uncheckedOutboxPayload())).toBe(true);
    expect(isUncheckedPayload(overrideOutboxPayload(override))).toBe(false);
  });
});

describe("a give-back Shipments did not take", () => {
  const pass = { requestId: "req-kept", usedAt: "2026-11-19T10:00:00.000Z" };

  it("is logged when the approval stays used - never silently", async () => {
    const log = (await import("encore.dev/log")).default;
    vi.mocked(log.error).mockClear();
    passesNotGivenBack.add("req-kept");
    try {
      await giveBackPass({ reason: "x", invoices: [], checked: true, pass });
      expect(vi.mocked(log.error)).toHaveBeenCalledWith(expect.stringMatching(/stays used/), { requestId: "req-kept" });
    } finally {
      passesNotGivenBack.delete("req-kept");
    }
  });
});

describe("the gate's day kept off a day set in Shipments (Y6, the outbox)", () => {
  it("sends the released row without its day when Shipments has one, the plate still going", () => {
    const released = { date: "2026-11-18", by: "eva@firma.cz" };
    expect(releasedPayloadToSend({ warehouseReleasedDate: "2026-11-19", plateNumber: "1AB2345" }, released)).toEqual({ payload: { plateNumber: "1AB2345" }, kept: released });
    expect(releasedPayloadToSend({ warehouseReleasedDate: "2026-11-19" }, released)).toEqual({ payload: {}, kept: released });
  });

  it("sends the day as before when none is set there (or it is the gate's own), or Shipments can't be asked", () => {
    const payload = { warehouseReleasedDate: "2026-11-19" };
    expect(releasedPayloadToSend(payload, null)).toEqual({ payload, kept: null });
    expect(releasedPayloadToSend(payload, undefined)).toEqual({ payload, kept: null });
    // A row carrying only the plate has no day to keep off.
    expect(releasedPayloadToSend({ plateNumber: "1AB2345" }, { date: "2026-11-18", by: "" })).toEqual({ payload: { plateNumber: "1AB2345" }, kept: null });
  });
});

describe("a day on the shipment the gate's own release wrote", () => {
  it("is not taken for a release in Shipments: the gate sends its days with the read and with the pass use", async () => {
    releasedInShipmentsOf.set("job-own", { date: "2026-11-18", by: "jana@firma.cz" });
    releasePasses.set("job-own", { requestId: "req-own", reason: "Asked by Jan: x — approved by Eva: y" });
    try {
      await expect(releasedInShipments("job-own", ["2026-11-18"])).resolves.toBeNull();
      expect(gateDaysAsked.get("job-own")).toEqual(["2026-11-18"]);
      // The stop then holds, and an approval is used for the release as for any other.
      await expect(gateReleasePass("job-own", unpaid, ["2026-11-18"])).resolves.toMatchObject({ override: { pass: { requestId: "req-own" } }, released: null });
      // A day the gate did not write is Shipments' (Y6).
      await expect(releasedInShipments("job-own", ["2026-11-17"])).resolves.toEqual({ date: "2026-11-18", by: "jana@firma.cz" });
    } finally {
      releasedInShipmentsOf.delete("job-own");
      releasePasses.delete("job-own");
    }
  });
});

describe("what a voided stamp left on the shipment", () => {
  const what = "warehouse released date";
  const override = overrideOutboxPayload({ reason: "Paid in cash at the gate", invoices: [], checked: true });

  it("says the date as before when only the date reached it", () => {
    expect(mayNeedCorrectingDetail(what, { dateSet: true, sending: false, notes: [] })).toEqual({
      detail: "its warehouse released date was set from this stamp and is not changed back — correct it in Shipments if needed",
      notice: "The shipment is not changed back — its warehouse released date was (or is being) set from this stamp. Check it in Shipments and correct it if needed.",
    });
    expect(mayNeedCorrectingDetail(what, { dateSet: false, sending: true, notes: [] })?.detail).toBe(
      "its warehouse released date was being sent from this stamp at the moment of the void and is not changed back — check it in Shipments",
    );
    expect(mayNeedCorrectingDetail(what, { dateSet: false, sending: false, notes: [] })).toBeNull();
  });

  it("names a release on prepayment recorded from the stamp, with its reason", () => {
    const both = mayNeedCorrectingDetail(what, { dateSet: true, sending: false, notes: [override] })!;
    expect(both.detail).toBe(
      "its warehouse released date was set from this stamp and is not changed back — correct it in Shipments if needed; the release on prepayment recorded from this stamp (reason: Paid in cash at the gate) stays in its history and on its Tracking tab",
    );
    expect(both.notice).toMatch(/, and the release on prepayment recorded from this stamp \(reason: Paid in cash at the gate\) stays in its history/);
    // The override alone reached the shipment (its day was cancelled): still said.
    expect(mayNeedCorrectingDetail(what, { dateSet: false, sending: false, notes: [override] })?.detail).toBe(
      "the release on prepayment recorded from this stamp (reason: Paid in cash at the gate) stays in its history and on its Tracking tab — correct it in Shipments if needed",
    );
  });

  it("names the \"Prepayment not checked\" line, and keeps a long reason short", () => {
    expect(mayNeedCorrectingDetail(what, { dateSet: false, sending: false, notes: [uncheckedOutboxPayload()] })?.detail).toMatch(/^the line "Prepayment not checked" noted from this stamp stays/);
    const long = overrideOutboxPayload({ reason: "x".repeat(300), invoices: [], checked: true });
    expect(mayNeedCorrectingDetail(what, { dateSet: false, sending: false, notes: [long] })!.detail).toContain(`(reason: ${"x".repeat(119)}…)`);
  });
});

describe("a job Shipments released first (Y6)", () => {
  it("is read before the release: the day and who set it, none while empty, not known when Shipments can't be asked", async () => {
    releasedInShipmentsOf.set("job-r", { date: "2026-11-18", by: "eva@firma.cz" });
    releasedInShipmentsOf.set("job-down", new Error("shipments down"));
    try {
      await expect(releasedInShipments("job-r")).resolves.toEqual({ date: "2026-11-18", by: "eva@firma.cz" });
      await expect(releasedInShipments("job-none")).resolves.toBeNull();
      await expect(releasedInShipments("job-down")).resolves.toBeUndefined();
    } finally {
      releasedInShipmentsOf.clear();
    }
  });

  it("leaves a line on the gate record naming the day and who released it", () => {
    const at = "2026-11-19T10:00:00.000Z";
    expect(releasedInShipmentsEvent({ date: "2026-11-18", by: "eva@firma.cz" }, at, "Jana")).toEqual({ kind: "releasedInShipments", label: "Released in Shipments on 18.11.2026 by eva@firma.cz", at, by: "Jana" });
    expect(releasedInShipmentsEvent({ date: "2026-11-18", by: "" }, at, "Jana").label).toBe("Released in Shipments on 18.11.2026");
  });
});

describe("the stop when Invoicing can't be asked (P17)", () => {
  it("reads prepayment terms as Invoicing does", () => {
    expect(isPrepaymentTerms("Prepayment")).toBe(true);
    expect(isPrepaymentTerms("100% PREPAYMENT before release")).toBe(true);
    expect(isPrepaymentTerms("14 days")).toBe(false);
    expect(isPrepaymentTerms(null)).toBe(false);
  });

  it("goes by the customer's terms in the Customer Database: a customer not on prepayment is never stopped, one on prepayment is, and a read that fails refuses", async () => {
    releaseChecks.set("job-a", new Error("invoicing down"));
    releaseChecks.set("job-b", new Error("invoicing down"));
    releaseChecks.set("job-c", new Error("invoicing down"));
    customerTermsOf.set("job-a", "14 days net");
    customerTermsOf.set("job-b", "Prepayment");
    customerTermsOf.set("job-c", new Error("customers down"));
    try {
      await expect(customerOnPrepayment("job-a")).resolves.toBe(false);
      await expect(customerOnPrepayment("job-b")).resolves.toBe(true);
      await expect(customerOnPrepayment("job-c")).resolves.toBeNull();
      // Not a job Shipments knows: not known, refused.
      await expect(customerOnPrepayment("job-unknown")).resolves.toBeNull();

      // Let through, but said to be unchecked (the record and the shipment say so).
      await expect(gateReleaseVerdict("job-a", "user", undefined)).resolves.toEqual({ check: null, verdict: { override: null }, unchecked: true });
      await expect(gateReleaseVerdict("job-b", "user", undefined)).resolves.toMatchObject({ verdict: { refusal: expect.stringMatching(/^Whether the job is paid could not be checked/) } });
      await expect(gateReleaseVerdict("job-c", "user", undefined)).resolves.toMatchObject({ verdict: { refusal: expect.stringMatching(/could not be checked/) } });
      // Invoicing answering: its word goes, the terms are not read.
      await expect(gateReleaseVerdict("job-paid", "user", undefined)).resolves.toEqual({ check: { prepaymentUnpaid: false, unpaid: [], prepaymentInvoices: [] }, verdict: { override: null } });
    } finally {
      for (const id of ["job-a", "job-b", "job-c"]) {
        releaseChecks.delete(id);
        customerTermsOf.delete(id);
      }
    }
  });

  it("stops a job with no customer - a user is refused, a manager may release it with a reason - never letting it through on nothing", async () => {
    releaseChecks.set("job-nobody", new Error("invoicing down"));
    jobsWithNoCustomer.add("job-nobody");
    try {
      await expect(customerOnPrepayment("job-nobody")).resolves.toBe("noCustomer");
      const refused = await gateReleaseVerdict("job-nobody", "user", undefined);
      expect(refused.unchecked).toBeUndefined();
      expect(refused.verdict).toEqual({
        refusal:
          "Whether the job is paid could not be checked, and the job has no customer whose payment terms could tell: give the job its customer in Shipments. A manager can release it with a reason",
      });
      await expect(gateReleaseVerdict("job-nobody", "manager", "Customer named on the phone")).resolves.toMatchObject({
        verdict: { override: { reason: "Customer named on the phone", invoices: [], checked: false } },
      });
    } finally {
      releaseChecks.delete("job-nobody");
      jobsWithNoCustomer.delete("job-nobody");
    }
  });

  it("leaves a line on the gate record that the payment was not checked", () => {
    const at = "2026-11-19T10:00:00.000Z";
    expect(paymentUncheckedEvent(at, "Jana")).toEqual({
      kind: "paymentNotChecked",
      label: "WH release: payment not checked",
      at,
      by: "Jana",
      detail: "Invoicing could not be asked - let through as the customer is not on prepayment in the Customer Database",
    });
  });
});
