import { describe, expect, it } from "vitest";
import { GENERAL_PRACTICE, TIME_LIMITS_OFF } from "../lib/claimTimeLimits";
import { CLAIM_RANK, claimFactsByJob, claimSignals, type CargoClaimFact, type ClaimFacts } from "../lib/managersCockpitClaims";

// The cargo claims' signals on Shipments → Managers (Council Outlay 11, D21). Today is Wednesday
// 18 Nov 2026; the job is a sea import delivered on the 16th unless a test says otherwise.

const TODAY = "2026-11-18";
const ON = { enabled: true, limits: GENERAL_PRACTICE };
const job = (over = {}) => ({ id: "j1", tradeDirection: "Import", freightMode: "Sea Freight", department: "", actualDeliveryDate: "2026-11-16" as string | null, actualArrival: null as string | null, ...over });
const claim = (over: Partial<CargoClaimFact> = {}): CargoClaimFact => ({ id: "c1", createdAt: new Date("2026-11-16T09:00:00Z"), status: "open", noticeDate: null, ...over });
const facts = (claims: CargoClaimFact[], limits: ClaimFacts["limits"] = ON): ClaimFacts => ({ byJob: new Map([["j1", claims]]), limits });
const tags = (j: ReturnType<typeof job>, f: ClaimFacts, today = TODAY) => claimSignals(j, f, today).map((s) => `${s.urgent ? "URGENT" : "attention"} ${s.rank} ${s.kind} ${s.text}`);

describe("with the claim time limits on", () => {
  it("the carrier not notified is a warning from the claim's creation, URGENT from the day before the deadline and once it passed", () => {
    // Sea: 3 days from the 16th - the 19th.
    expect(tags(job(), facts([claim()]), "2026-11-17")).toEqual([`attention ${CLAIM_RANK.notNotified} claim Cargo claim: carrier not notified · notice by 19.11.`]);
    expect(tags(job(), facts([claim()]))).toEqual([`URGENT ${CLAIM_RANK.noticeUrgent} claim Cargo claim: notify the carrier by 19.11.`]);
    expect(tags(job(), facts([claim()]), "2026-11-19")).toEqual([`URGENT ${CLAIM_RANK.noticeUrgent} claim Cargo claim: notify the carrier today`]);
    expect(tags(job(), facts([claim()]), "2026-11-20")).toEqual([`URGENT ${CLAIM_RANK.noticeUrgent} claim Cargo claim: carrier not notified, notice deadline 19.11. passed`]);
  });

  it("is URGENT from the WORKING day before the deadline: a Monday deadline from the Friday before (Y5)", () => {
    // Delivered Friday the 20th: sea notice by Monday the 23rd.
    const friday = job({ actualDeliveryDate: "2026-11-20" });
    const raised = claim({ createdAt: new Date("2026-11-20T09:00:00Z") });
    expect(tags(friday, facts([raised]), "2026-11-20")).toEqual([`URGENT ${CLAIM_RANK.noticeUrgent} claim Cargo claim: notify the carrier by 23.11.`]);
    expect(tags(friday, facts([raised]), "2026-11-21")).toEqual([`URGENT ${CLAIM_RANK.noticeUrgent} claim Cargo claim: notify the carrier by 23.11.`]);
    // Delivered Thursday the 19th: notice by Sunday the 22nd - URGENT on the Friday, its working day before.
    const thursday = job({ actualDeliveryDate: "2026-11-19" });
    expect(tags(thursday, facts([raised]), "2026-11-20")).toEqual([`URGENT ${CLAIM_RANK.noticeUrgent} claim Cargo claim: notify the carrier by 22.11.`]);
    expect(tags(thursday, facts([raised]), "2026-11-19")).toEqual([`attention ${CLAIM_RANK.notNotified} claim Cargo claim: carrier not notified · notice by 22.11.`]);
    // The company's day off is no working day: delivered Wednesday the 18th, notice by Saturday the 21st -
    // with Friday the 20th off, Thursday is its working day before.
    const wednesday = job({ actualDeliveryDate: "2026-11-18" });
    expect(claimSignals(wednesday, facts([claim()]), "2026-11-19", ["2026-11-20"]).map((s) => s.urgent)).toEqual([true]);
    expect(claimSignals(wednesday, facts([claim()]), "2026-11-19").map((s) => s.urgent)).toEqual([false]);
  });

  it("counts from the ATA when there is no delivery, and says no deadline when there is neither", () => {
    expect(tags(job({ actualDeliveryDate: null, actualArrival: "2026-11-10" }), facts([claim()]))).toEqual([
      `URGENT ${CLAIM_RANK.noticeUrgent} claim Cargo claim: carrier not notified, notice deadline 13.11. passed`,
    ]);
    expect(tags(job({ actualDeliveryDate: null }), facts([claim()]))).toEqual([`attention ${CLAIM_RANK.notNotified} claim Cargo claim: carrier not notified`]);
  });

  it("says the suit time bar 60 days ahead, URGENT at 30 and once it passed, until the claim is closed", () => {
    const notified = claim({ noticeDate: "2025-12-01", status: "with_insurer" });
    // Delivered 16.11.2025: time-barred 16.11.2026.
    const old = (deliveredOn: string) => job({ actualDeliveryDate: deliveredOn });
    expect(tags(old("2026-01-10"), facts([notified]))).toEqual([`attention ${CLAIM_RANK.suitAhead} claim Cargo claim: suit time bar 10.01.2027 · 53 days left`]);
    expect(tags(old("2025-12-10"), facts([notified]))).toEqual([`URGENT ${CLAIM_RANK.suitUrgent} claim Cargo claim: suit time bar 10.12.2026 · 22 days left`]);
    expect(tags(old("2025-11-16"), facts([notified]))).toEqual([`URGENT ${CLAIM_RANK.suitUrgent} claim Cargo claim: suit time-barred since 16.11.2026`]);
    // Far off and notified: nothing of the limits - only how long it has stood, once that is long.
    expect(tags(old("2026-11-01"), facts([claim({ noticeDate: "2026-11-02", createdAt: new Date("2026-11-02T09:00:00Z") })]))).toEqual([
      `attention ${CLAIM_RANK.openSince} claim Cargo claim open since 02.11.`,
    ]);
  });

  it("says the same words once for two claims of one job", () => {
    expect(tags(job(), facts([claim(), claim({ id: "c2" })]))).toHaveLength(1);
  });
});

describe("with the claim time limits off", () => {
  it("says only how long an open claim has stood, from 14 days", () => {
    expect(tags(job(), facts([claim({ createdAt: new Date("2026-11-05T09:00:00Z") })], TIME_LIMITS_OFF))).toEqual([]);
    expect(tags(job(), facts([claim({ createdAt: new Date("2026-11-04T09:00:00Z") })], TIME_LIMITS_OFF))).toEqual([`attention ${CLAIM_RANK.openSince} claim Cargo claim open since 04.11.`]);
  });

  it("and the same when they could not be read", () => {
    expect(tags(job(), facts([claim({ createdAt: new Date("2026-11-01T09:00:00Z") })], null))).toEqual([`attention ${CLAIM_RANK.openSince} claim Cargo claim open since 01.11.`]);
  });
});

describe("what is not known", () => {
  it("gives no tag: claims that could not be read, a job with none", () => {
    expect(claimSignals(job(), { byJob: null, limits: ON }, TODAY)).toEqual([]);
    expect(claimSignals(job({ id: "j2" }), facts([claim()]), TODAY)).toEqual([]);
  });
});

describe("the rows read", () => {
  it("are a job's claims, a row nobody filled in left out", () => {
    const row = (over = {}) => ({ ...claim(), shipmentId: "j1", cargoState: "", note: "", claimAmount: null, claimCurrency: "", ...over });
    const map = claimFactsByJob([row(), row({ id: "c2", cargoState: "Damaged" }), row({ id: "c3", claimAmount: "5" }), row({ id: "c4", shipmentId: "j2", note: "Wet" })]);
    expect([...map].map(([id, list]) => [id, list.map((c) => c.id)])).toEqual([
      ["j1", ["c2", "c3"]],
      ["j2", ["c4"]],
    ]);
  });
});
