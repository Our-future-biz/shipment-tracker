import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ invoicing: {}, shipments: {}, auth: {} }));

import { gateOverrideEvent, gateReleaseStop, type GatePaymentCheck } from "../../warehouseConcept/services/releasePayment";
import { overrideLine, prepaymentStop } from "../lib/prepaymentStop";

// The Warehouse Concept gate words its prepayment stop as a copy of lib/prepaymentStop (services share code through
// apps/api/lib only): this holds the two to the same words - the refusal after what each stops, and the override
// line after what each releases - for every kind of answer Invoicing gives.

const checks: Record<string, GatePaymentCheck | null> = {
  unpaid: { prepaymentUnpaid: true, unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }] },
  "prepayment invoices only": {
    prepaymentUnpaid: true,
    unpaid: [
      { number: "FV2026001", leftToPay: 1200, currency: "EUR" },
      { number: "FV2026002", leftToPay: 50, currency: "EUR" },
    ],
    prepaymentInvoices: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }],
  },
  "not invoiced (L3)": { prepaymentUnpaid: true, unpaid: [], prepaymentUninvoiced: [{ currency: "EUR", amount: 800 }, { currency: "CZK", amount: 12500 }] },
  "unpaid and not invoiced": {
    prepaymentUnpaid: true,
    unpaid: [{ number: "FV2026001", leftToPay: 1200, currency: "EUR" }],
    prepaymentUninvoiced: [{ currency: "EUR", amount: 800 }],
  },
  "no invoice named": { prepaymentUnpaid: true, unpaid: [] },
  "not checked": null,
};

// What follows the subject: "…: the job is on prepayment and not paid - …", "… on prepayment (unpaid: …) - reason: …".
const afterSubject = (text: string) => text.slice(text.indexOf(": ") + 2);
const fromPrepayment = (text: string) => text.slice(text.indexOf(" on prepayment"));

describe("the gate's prepayment stop says what Shipments' says", () => {
  for (const [name, check] of Object.entries(checks)) {
    it(`for ${name}`, () => {
      for (const [role, reason] of [["user", undefined], ["manager", "ok"]] as const) {
        const gate = gateReleaseStop(check, role, reason);
        const shipments = prepaymentStop("warehouse_released", check, role, reason);
        expect("refusal" in gate && "refusal" in shipments).toBe(true);
        if ("refusal" in gate && "refusal" in shipments) {
          // Not checked, the sentence has no subject: it is the same from its start.
          expect(check ? afterSubject(gate.refusal) : gate.refusal).toBe(check ? afterSubject(shipments.refusal) : shipments.refusal);
        }
      }
      const gate = gateReleaseStop(check, "manager", "Paid in cash");
      const shipments = prepaymentStop("warehouse_released", check, "manager", "Paid in cash");
      expect("override" in gate && "override" in shipments).toBe(true);
      if ("override" in gate && gate.override && "override" in shipments && shipments.override) {
        expect(gate.override).toEqual(shipments.override);
        expect(fromPrepayment(gateOverrideEvent(gate.override, "2026-11-19T10:00:00.000Z", "Jana").label)).toBe(fromPrepayment(overrideLine("warehouse_released", shipments.override)));
      }
    });
  }
});
