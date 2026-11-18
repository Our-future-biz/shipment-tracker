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
});
