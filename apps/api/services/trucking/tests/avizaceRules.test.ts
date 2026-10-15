import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  avizaceNeeded,
  avizacePending,
  avizaceTemplate,
  avizaceWarnings,
  cleanAvizace,
  cleanDecision,
  cleanException,
  exceptionLineText,
  podMissing,
  waitingCharge,
  type ExceptionInput,
} from "../lib/avizaceRules";
import { isInternalDepartment } from "../lib/internalRules";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import type { TariffSurcharge } from "../interfaces/interfaces";
import { load, stop } from "./truckingFakes";

// Phase 6 A rules: avizace needed / pending, the text to copy, POD missing in working days,
// exception input, decisions and their roles, and the waiting charge from the tariff.

const consignment = (over: Partial<TruckingConsignmentRecord> = {}) =>
  ({
    ref: "TCZ2026000007",
    delivery: { ...stop({ name: "Beta a.s.", street: "Masarykova 5", postcode: "60200", city: "Brno", contactPhone: "+420 777 222 333" }), id: "d", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load({ pieces: 12, palletPlaces: 4, weightKg: 1250.5 }),
    promisedDate: "2026-10-19",
    avizace: null,
    cancelledAt: null,
    deliveredAt: null,
    podReceivedAt: null,
    ...over,
  }) as TruckingConsignmentRecord;

describe("avizace", () => {
  it("is needed for B2C or a stop marked so; pending until recorded, delivered or cancelled", () => {
    expect(avizaceNeeded(consignment())).toBe(false);
    const b2c = consignment({ load: load({ b2c: true }) });
    expect(avizaceNeeded(b2c)).toBe(true);
    const marked = consignment({ delivery: { ...consignment().delivery, avizaceRequired: true } });
    expect(avizacePending(marked)).toBe(true);
    expect(avizacePending({ ...marked, avizace: cleanAvizace({ channel: "PHONE", contact: "Eva", agreedFrom: null, agreedTo: null, note: "" }, new Date(), "Jana") })).toBe(false);
    expect(avizacePending({ ...marked, deliveredAt: new Date() })).toBe(false);
    expect(avizaceWarnings([marked, b2c, consignment()])).toEqual(["TCZ2026000007: avizace needed and not recorded yet", "TCZ2026000007: avizace needed and not recorded yet"]);
  });

  it("prepares the text in Czech and English with the consignee, address, day and window, ref, goods and notes - never a PIN", () => {
    const c = consignment({
      load: load({ pieces: 12, palletPlaces: 4, weightKg: 1250.5, tailLift: true, b2c: true }),
      delivery: { ...consignment().delivery, windowFrom: "2026-10-19T06:00:00.000Z", windowTo: "2026-10-19T10:00:00.000Z" },
    });
    const t = avizaceTemplate(c);
    expect(t.cs).toContain("TCZ2026000007");
    expect(t.cs).toContain("Beta a.s., Masarykova 5, 60200 Brno");
    expect(t.cs).toContain("19. 10. 2026, 08:00–12:00");
    expect(t.cs).toContain("12 ks, 4 pal. míst, 1 250,5 kg");
    expect(t.cs).toContain("hydraulickým čelem");
    expect(t.cs).toContain("soukromou adresu");
    expect(t.en).toContain("19 Oct 2026, 08:00–12:00");
    expect(t.en).toContain("12 pcs, 4 pallet places, 1,250.5 kg");
    expect(t.en).toContain("tail lift");
    expect(t).toMatchObject({ subject: "Avizace doručení / Delivery notice TCZ2026000007", to: "+420 777 222 333" });
    expect(JSON.stringify(t)).not.toMatch(/PIN/i);
    const plain = avizaceTemplate(consignment({ promisedDate: null }));
    expect(plain.cs).toContain("bude upřesněn");
    expect(plain.en).not.toMatch(/tail lift|private address/);
  });

  it("records the channel, who was told and the window agreed; refuses what is wrong", () => {
    const r = cleanAvizace({ channel: "SMS", contact: " Eva ", agreedFrom: "2026-10-19T06:00:00Z", agreedTo: "2026-10-19T08:00:00Z", note: "gate 2" }, new Date("2026-10-15T10:00:00Z"), "Jana");
    expect(r).toEqual({ at: "2026-10-15T10:00:00.000Z", by: "Jana", channel: "SMS", contact: "Eva", agreedFrom: "2026-10-19T06:00:00.000Z", agreedTo: "2026-10-19T08:00:00.000Z", note: "gate 2" });
    expect(() => cleanAvizace({ channel: "FAX" as never, contact: "Eva", agreedFrom: null, agreedTo: null, note: "" }, new Date(), "J")).toThrow(/channel/);
    expect(() => cleanAvizace({ channel: "PHONE", contact: " ", agreedFrom: null, agreedTo: null, note: "" }, new Date(), "J")).toThrow(/who was told/);
    expect(() => cleanAvizace({ channel: "PHONE", contact: "E", agreedFrom: "2026-10-19T08:00:00Z", agreedTo: "2026-10-19T06:00:00Z", note: "" }, new Date(), "J")).toThrow(/ends before/);
  });
});

describe("POD missing", () => {
  it("counts working days after the delivery: more than 2, weekends and holidays skipped", () => {
    const mon = consignment({ deliveredAt: new Date("2026-10-12T08:00:00Z") });
    expect(podMissing(mon, "2026-10-14")).toBe(false);
    expect(podMissing(mon, "2026-10-15")).toBe(true);
    expect(podMissing({ ...mon, podReceivedAt: new Date() }, "2026-10-20")).toBe(false);
    // Friday's delivery: Mon + Tue are the 2 working days, missing from Wednesday.
    const fri = consignment({ deliveredAt: new Date("2026-10-16T08:00:00Z") });
    expect(podMissing(fri, "2026-10-20")).toBe(false);
    expect(podMissing(fri, "2026-10-21")).toBe(true);
    // 28 Oct is a CZ holiday: Tue 27 delivery → Thu 29, Fri 30 → missing from Mon 2 Nov.
    const tue = consignment({ deliveredAt: new Date("2026-10-27T08:00:00Z") });
    expect(podMissing(tue, "2026-10-30")).toBe(false);
    expect(podMissing(tue, "2026-11-02")).toBe(true);
    expect(podMissing(fri, "2026-10-21", ["2026-10-20"])).toBe(false);
  });
});

describe("delivery exceptions", () => {
  const input = (over: Partial<ExceptionInput> = {}): ExceptionInput => ({
    kind: "DAMAGE",
    failedReason: null,
    cause: null,
    description: "",
    pieces: 2,
    waitingMinutes: null,
    amount: null,
    currency: null,
    legId: null,
    ...over,
  });

  it("checks what each kind needs", () => {
    expect(cleanException(input())).toMatchObject({ kind: "DAMAGE", cause: "UNKNOWN", pieces: 2, currency: "CZK", amount: null });
    expect(() => cleanException(input({ pieces: null }))).toThrow(/pieces/);
    expect(() => cleanException(input({ kind: "FAILED_DELIVERY", pieces: null }))).toThrow(/reason/);
    expect(cleanException(input({ kind: "FAILED_DELIVERY", failedReason: "ABSENT", pieces: null })).failedReason).toBe("ABSENT");
    expect(() => cleanException(input({ kind: "WAITING_TIME", pieces: null }))).toThrow(/minutes/);
    expect(cleanException(input({ kind: "WAITING_TIME", pieces: null, waitingMinutes: 45, amount: 300.456 }))).toMatchObject({ waitingMinutes: 45, amount: 300.46 });
    expect(() => cleanException(input({ kind: "OTHER", pieces: null }))).toThrow(/Describe/);
    expect(() => cleanException(input({ kind: "LOST" as never }))).toThrow(/kind/);
    expect(() => cleanException(input({ amount: -1 }))).toThrow(/amount/);
    expect(() => cleanException(input({ legId: "x" }))).toThrow(/leg/);
    expect(exceptionLineText({ kind: "WAITING_TIME", waitingMinutes: 45, description: "" })).toBe("Waiting time 45 min");
    expect(exceptionLineText({ kind: "REDELIVERY", waitingMinutes: null, description: "" })).toBe("Redelivery");
  });

  it("charging, claiming or absorbing an amount is a manager's; absorbing nothing anyone's; a reason always", () => {
    const current = { amount: 500, currency: "CZK" as const, cause: "CUSTOMER" as const };
    const ask = (decision: string, amount: number | null = null) => ({ decision: decision as never, cause: null, amount, currency: null, reason: "agreed with the customer" });
    expect(cleanDecision(ask("CHARGE_CUSTOMER"), current, true)).toMatchObject({ decision: "CHARGE_CUSTOMER", amount: 500, currency: "CZK", cause: "CUSTOMER" });
    expect(() => cleanDecision(ask("CHARGE_CUSTOMER"), current, false)).toThrow(/Only a manager/);
    expect(() => cleanDecision(ask("CLAIM_HAULIER"), current, false)).toThrow(/Only a manager/);
    expect(() => cleanDecision(ask("ABSORB"), current, false)).toThrow(/Only a manager/);
    expect(cleanDecision(ask("ABSORB", 0), { ...current, amount: null }, false)).toMatchObject({ decision: "ABSORB", amount: 0 });
    expect(cleanDecision(ask("ABSORB"), { ...current, amount: null }, false).decision).toBe("ABSORB");
    expect(() => cleanDecision(ask("CHARGE_CUSTOMER"), { ...current, amount: null }, true)).toThrow(/amount/);
    expect(() => cleanDecision(ask("PENDING"), current, true)).toThrow(/decision/);
    expect(() => cleanDecision({ ...ask("ABSORB", 0), reason: "" }, current, true)).toThrow(/reason/);
  });

  it("prices waiting per started 15 minutes after the free time from the WAITING_TIME surcharge", () => {
    const perHour: TariffSurcharge = { code: "WAITING_TIME", calc: "PER_HOUR", value: 600, min: null, onBasePlusSurcharges: false };
    // FTL: 120 free; 165 min waited → 45 min → 3 quarters × 150.
    expect(waitingCharge(perHour, 165, 120, 1)).toBe(450);
    expect(waitingCharge(perHour, 121, 120, 1)).toBe(150);
    expect(waitingCharge(perHour, 100, 120, 1)).toBe(0);
    // LTL: 30 free; 45 waited → 1 quarter; a minimum applies once anything is charged.
    expect(waitingCharge({ ...perHour, min: 200 }, 45, 30, 1)).toBe(200);
    expect(waitingCharge({ ...perHour, calc: "FLAT", value: 100 }, 61, 30, 0.01)).toBe(300);
    expect(waitingCharge({ ...perHour, calc: "PCT" }, 200, 30, 1)).toBeNull();
    expect(waitingCharge(null, 200, 30, 1)).toBeNull();
  });
});

describe("internal departments", () => {
  it("bills every department but the Road Department internally; no department = Trucking's own", () => {
    expect(isInternalDepartment("Road Department")).toBe(false);
    expect(isInternalDepartment(" road department ")).toBe(false);
    expect(isInternalDepartment("")).toBe(false);
    expect(isInternalDepartment(null)).toBe(false);
    expect(isInternalDepartment("Ocean Department")).toBe(true);
  });
});
