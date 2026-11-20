import { describe, expect, it } from "vitest";
import { asksMyJobs, myJobsOf, myJobsWaiting, withMyJobs } from "./myJobs";

const at = (query: string) => new URLSearchParams(query);

describe("the Shipments list's My jobs (mock council S9-1)", () => {
  it("asks the server for the signed-in user's jobs while it is on", () => {
    expect(myJobsOf(at("mine=1"), " eva@firm.cz ")).toBe("eva@firm.cz");
    expect(myJobsOf(at("mine=1&status=active"), "eva@firm.cz")).toBe("eva@firm.cz");
  });

  it("asks nothing while it is off, or before the user is known", () => {
    expect(myJobsOf(at(""), "eva@firm.cz")).toBeUndefined();
    expect(myJobsOf(at("mine=0"), "eva@firm.cz")).toBeUndefined();
    expect(myJobsOf(at("mine=1"), undefined)).toBeUndefined();
  });

  it("waits for the signed-in user before loading the list with My jobs on, never with it off (review of S9-1)", () => {
    expect(myJobsWaiting(at("mine=1"), undefined)).toBe(true);
    expect(myJobsWaiting(at("mine=1"), " ")).toBe(true);
    expect(myJobsWaiting(at("mine=1"), "eva@firm.cz")).toBe(false);
    expect(myJobsWaiting(at(""), undefined)).toBe(false);
  });

  it("is turned on and off in the address, the rest of it kept", () => {
    const on = withMyJobs(at("q=hamburg&status=active"), true);
    expect(asksMyJobs(on)).toBe(true);
    expect(on.get("q")).toBe("hamburg");
    const off = withMyJobs(on, false);
    expect(asksMyJobs(off)).toBe(false);
    expect(off.toString()).toBe("q=hamburg&status=active");
  });
});
