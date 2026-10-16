import { describe, expect, it, vi } from "vitest";

const claimsFor = vi.fn();
const trips = vi.fn(async (): Promise<unknown[]> => []);
const legs = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("../repositories/exception.repository", () => ({ exceptionRepository: { claimsFor: (...a: unknown[]) => claimsFor(...a) } }));
vi.mock("../repositories/trip.repository", () => ({ tripRepository: { findMany: () => trips() } }));
vi.mock("../repositories/leg.repository", () => ({ legRepository: { findMany: () => legs() } }));

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

  it("sums only the claims in the target's buy currency, never CZK into a EUR price (C15)", async () => {
    trips.mockResolvedValueOnce([{ id: "t1", buy: { currency: "EUR" } }]);
    legs.mockResolvedValueOnce([{ id: "l1", buy: { currency: "CZK" } }]);
    claimsFor.mockResolvedValueOnce([
      { targetKind: "TRIP", targetId: "t1", amount: 2000, currency: "CZK", exceptionId: "e1" },
      { targetKind: "TRIP", targetId: "t1", amount: 80.1, currency: "EUR", exceptionId: "e2" },
      { targetKind: "TRIP", targetId: "t1", amount: 0.2, currency: "EUR", exceptionId: "e3" },
      { targetKind: "PARTNER_LEG", targetId: "l1", amount: 90, currency: "CZK", exceptionId: "e4" },
    ]);
    const claimed = await exceptionClaims.claimedFor("company-1", [
      { kind: "TRIP", id: "t1" },
      { kind: "PARTNER_LEG", id: "l1" },
    ]);
    expect(Object.fromEntries(claimed)).toEqual({ t1: 80.3, l1: 90 });
  });
});
