import { describe, expect, it } from "vitest";
import { everyHeldOnApproval, mayBeStopped, overrideReasons, releaseStanding, takesOverrideReason, withOverrideReason, type ReleaseJob } from "./releaseReasons";

const job = (shipmentId: string, over: Partial<ReleaseJob> = {}): ReleaseJob => ({ shipmentId, held: false, unchecked: false, stopped: false, pass: false, ...over });

describe("releaseStanding", () => {
  it("shows a job with a manager's approval as going through on it, whatever would stop it", () => {
    expect(releaseStanding(job("a", { held: true, pass: true }))).toBe("on_approval");
    expect(releaseStanding(job("a", { stopped: true, pass: true }))).toBe("on_approval");
    expect(releaseStanding(job("a", { unchecked: true, pass: true }))).toBe("on_approval");
  });

  it("shows the others as what the stop makes of them", () => {
    expect(releaseStanding(job("a", { stopped: true, held: true }))).toBe("stopped");
    expect(releaseStanding(job("a", { held: true }))).toBe("likely_stopped");
    expect(releaseStanding(job("a", { unchecked: true }))).toBe("unchecked");
    expect(releaseStanding(job("a"))).toBe("free");
    expect(mayBeStopped(job("a"))).toBe(false);
    expect(mayBeStopped(job("a", { unchecked: true }))).toBe(true);
  });
});

describe("overrideReasons: the manager's reason per job", () => {
  const jobs = [
    job("held", { held: true }),
    job("held-approved", { held: true, pass: true }),
    job("free"),
    job("unchecked", { unchecked: true }),
    job("unchecked-approved", { unchecked: true, pass: true }),
  ];

  it("goes only with the held jobs no approval lets through - never with an approved or a free one", () => {
    const reasons = overrideReasons(jobs, "  agreed with the owner  ");
    expect([...reasons]).toEqual([
      ["held", "agreed with the owner"],
      ["unchecked", "agreed with the owner"],
    ]);
    expect(takesOverrideReason(jobs[1]!)).toBe(false);
    expect(takesOverrideReason(jobs[2]!)).toBe(false);
  });

  it("gives each job its own payload: the reason only where it belongs", () => {
    const reasons = overrideReasons(jobs, "agreed with the owner");
    const data = { warehouseReleasedDate: "2026-11-18", warehouseTruck: "TCZ2600007" };
    const payloads = Object.fromEntries(jobs.map((j) => [j.shipmentId, withOverrideReason(data, j.shipmentId, reasons)]));
    expect(payloads).toEqual({
      held: { ...data, paymentOverrideReason: "agreed with the owner" },
      "held-approved": data,
      free: data,
      unchecked: { ...data, paymentOverrideReason: "agreed with the owner" },
      "unchecked-approved": data,
    });
    // An approved job's write carries no reason field at all.
    expect("paymentOverrideReason" in payloads["held-approved"]!).toBe(false);
    expect("paymentOverrideReason" in payloads.free!).toBe(false);
  });

  it("after a stop, goes with the stopped jobs - not with one that got its approval meanwhile", () => {
    const retry = [job("stopped", { stopped: true, held: true }), job("stopped-approved", { stopped: true, held: true, pass: true }), job("stopped-unchecked", { stopped: true, unchecked: true })];
    expect([...overrideReasons(retry, "customer pays on Friday").keys()]).toEqual(["stopped", "stopped-unchecked"]);
  });

  it("sends no reason when none was typed, or without the per-job list", () => {
    expect(overrideReasons(jobs, "   ").size).toBe(0);
    expect(overrideReasons(jobs, undefined).size).toBe(0);
    const data = { warehouseReleasedDate: "2026-11-18" };
    expect(withOverrideReason(data, "held", undefined)).toBe(data);
    expect(withOverrideReason(data, "held", new Map([["held", "  "]]))).toBe(data);
  });
});

describe("everyHeldOnApproval", () => {
  it("is true when each job the stop holds has an approval, and there is such a job", () => {
    expect(everyHeldOnApproval([job("a", { held: true, pass: true }), job("b")])).toBe(true);
    expect(everyHeldOnApproval([job("a", { stopped: true, pass: true }), job("b", { held: true, pass: true })])).toBe(true);
    expect(everyHeldOnApproval([job("a", { held: true, pass: true }), job("b", { held: true })])).toBe(false);
    expect(everyHeldOnApproval([job("a"), job("b", { unchecked: true })])).toBe(false);
    expect(everyHeldOnApproval([])).toBe(false);
  });
});
