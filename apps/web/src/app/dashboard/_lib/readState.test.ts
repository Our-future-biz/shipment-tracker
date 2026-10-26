import { describe, expect, it } from "vitest";
import { READ_STATE_RANK, readState } from "./readState";

const notice = (partial: { authorId?: string; unread?: boolean; readAt?: string | null } = {}) => ({
  authorId: "someone",
  unread: false,
  readAt: null,
  ...partial,
});

describe("readState", () => {
  it("is the reader's own notice whatever else is set", () => {
    expect(readState(notice({ authorId: "me", readAt: "2026-10-01T08:00:00Z" }), "me")).toBe("yours");
  });

  it("is unread until the reader confirms it, then read", () => {
    expect(readState(notice({ unread: true }), "me")).toBe("unread");
    expect(readState(notice({ readAt: "2026-10-01T08:00:00Z" }), "me")).toBe("read");
  });

  it("is neither read nor unread for a notice not addressed to the reader (an admin sees every board)", () => {
    expect(readState(notice(), "me")).toBe("other");
    expect(readState(notice(), undefined)).toBe("other");
  });

  it("sorts unread first, then read, then not addressed, then the reader's own", () => {
    const states = (["yours", "other", "read", "unread"] as const).slice().sort((a, b) => READ_STATE_RANK[a] - READ_STATE_RANK[b]);
    expect(states).toEqual(["unread", "read", "other", "yours"]);
  });
});
