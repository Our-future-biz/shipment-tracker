import { describe, expect, it, vi } from "vitest";

const claimsFor = vi.fn();
vi.mock("../repositories/exception.repository", () => ({ exceptionRepository: { claimsFor: (...a: unknown[]) => claimsFor(...a) } }));

const { exceptionClaims } = await import("../lib/haulierClaims");

describe("claims against a haulier, from delivery exceptions", () => {
  it("sums the company's CLAIM_HAULIER amounts per target of the same kind", async () => {
    claimsFor.mockResolvedValueOnce([
      { targetKind: "TRIP", targetId: "t1", amount: 500, currency: "CZK", exceptionId: "e1" },
      { targetKind: "TRIP", targetId: "t1", amount: 250, currency: "CZK", exceptionId: "e2" },
      { targetKind: "PARTNER_LEG", targetId: "l1", amount: 90, currency: "CZK", exceptionId: "e3" },
      // A trip claim never counts for a partner leg that happens to share the id.
      { targetKind: "TRIP", targetId: "l1", amount: 999, currency: "CZK", exceptionId: "e4" },
    ]);
    const claimed = await exceptionClaims.claimedFor("company-1", [
      { kind: "TRIP", id: "t1" },
      { kind: "PARTNER_LEG", id: "l1" },
      { kind: "TRIP", id: "t2" },
    ]);
    expect(claimsFor).toHaveBeenCalledWith("company-1", ["t1", "l1", "t2"]);
    expect(Object.fromEntries(claimed)).toEqual({ t1: 750, l1: 90 });
  });
});
