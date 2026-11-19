import { describe, expect, it } from "vitest";
import { floorReleaseStopText, stopWhy } from "./releaseStop";

const UNPAID = "The WH release can't be stamped: the job is on prepayment and not paid - FV2026001 (1,200.00 EUR left to pay). As a manager you can release it all the same: give a reason (at least 3 characters)";
const UNCHECKED = "Whether the job is paid could not be checked: try again in a moment. A manager can release it with a reason";

describe("a WH release floor mode sent that the prepayment stop refused (n28)", () => {
  it("keeps the server's why - amounts with their decimal points too - and drops what it says to do next", () => {
    expect(stopWhy(UNPAID)).toBe("The WH release can't be stamped: the job is on prepayment and not paid - FV2026001 (1,200.00 EUR left to pay).");
    expect(stopWhy(UNCHECKED)).toBe("Whether the job is paid could not be checked: try again in a moment.");
    expect(stopWhy("No sentence end")).toBe("No sentence end");
  });

  it("points a manager to the reason on the full gate job, and a user to ask a manager there", () => {
    expect(floorReleaseStopText(UNPAID, true).next).toBe("Release it with a reason on the full gate job");
    expect(floorReleaseStopText(UNPAID, false).next).toBe("Ask a manager to release it on the full gate job");
  });
});
