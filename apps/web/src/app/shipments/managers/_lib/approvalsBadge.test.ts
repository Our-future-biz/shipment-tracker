import { describe, expect, it } from "vitest";
import { approvalsBadge } from "./approvalsBadge";

const read = (waiting: number) => ({ waiting, isError: false });
const failed = { waiting: 0, isError: true };

describe("Shipments → Managers: the Approvals tab's count", () => {
  it("adds up what waits in both queues, and shows nothing when nothing waits", () => {
    expect(approvalsBadge([read(2), read(3)])).toBe("5");
    expect(approvalsBadge([read(0), read(1)])).toBe("1");
    expect(approvalsBadge([read(0), read(0)])).toBeNull();
  });

  it("says at least what it could read when one queue failed - also when that is none", () => {
    expect(approvalsBadge([read(3), failed])).toBe("3+");
    expect(approvalsBadge([failed, read(1)])).toBe("1+");
    expect(approvalsBadge([read(0), failed])).toBe("0+");
  });

  it("says the count is not known when neither could be read", () => {
    expect(approvalsBadge([failed, failed])).toBe("–");
  });

  // Step 3: release requests, Customs Office changes, document changes.
  it("adds up three queues, and shows nothing when nothing waits in any", () => {
    expect(approvalsBadge([read(1), read(2), read(3)])).toBe("6");
    expect(approvalsBadge([read(4), read(0), read(0)])).toBe("4");
    expect(approvalsBadge([read(0), read(0), read(0)])).toBeNull();
  });

  it("says at least what the others hold when one or two of three failed", () => {
    expect(approvalsBadge([failed, read(2), read(3)])).toBe("5+");
    expect(approvalsBadge([read(1), failed, failed])).toBe("1+");
    expect(approvalsBadge([failed, read(0), read(0)])).toBe("0+");
  });

  it("says the count is not known when none of three could be read", () => {
    expect(approvalsBadge([failed, failed, failed])).toBe("–");
  });

  it("shows no pill where there is no queue at all", () => {
    expect(approvalsBadge([])).toBeNull();
  });
});
