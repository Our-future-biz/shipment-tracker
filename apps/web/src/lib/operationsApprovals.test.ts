import { describe, expect, it } from "vitest";
import { operationsApprovalsLine } from "./operationsApprovals";

const q = (waiting: number, isError = false) => ({ waiting, isError });

describe("operationsApprovalsLine", () => {
  it("adds up the three queues", () => {
    expect(operationsApprovalsLine([q(2), q(0), q(3)])).toEqual({ count: 5, atLeast: false, title: "5 operations approvals waiting" });
    expect(operationsApprovalsLine([q(0), q(1), q(0)])?.title).toBe("1 operations approval waiting");
  });

  it("shows no line while nothing waits", () => {
    expect(operationsApprovalsLine([q(0), q(0), q(0)])).toBeNull();
    expect(operationsApprovalsLine([])).toBeNull();
  });

  it("counts what was read and marks it when a queue could not be", () => {
    expect(operationsApprovalsLine([q(1), q(0, true), q(2)])).toEqual({ count: 3, atLeast: true, title: "3+ operations approvals waiting" });
    expect(operationsApprovalsLine([q(1), q(9, true), q(0)])?.title).toBe("1+ operations approvals waiting");
  });

  it("shows no line when nothing is known to wait, read or not", () => {
    expect(operationsApprovalsLine([q(0), q(0, true), q(0)])).toBeNull();
    expect(operationsApprovalsLine([q(4, true), q(2, true), q(1, true)])).toBeNull();
  });
});
