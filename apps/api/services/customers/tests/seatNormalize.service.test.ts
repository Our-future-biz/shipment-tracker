import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
const addresses = vi.hoisted(() => ({ seatsOf: vi.fn(), applySeats: vi.fn() }));
vi.mock("../repositories/customerAddress.repository", () => ({ customerAddressRepository: addresses }));

// The endpoint: superadmins only, on their own company.
const auth = vi.hoisted(() => ({ role: "superadmin" }));
vi.mock("encore.dev/api", () => ({
  api: (_opts: unknown, handler: unknown) => handler,
  APIError: {
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    unauthenticated: (msg: string) => new Error(msg),
  },
}));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: COMPANY, role: auth.role }) }));

import { customerSeatService } from "../services/seatNormalize.service";
import { customerSeatNormalize } from "../controllers/customerSeatNormalize.controller";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const created = new Date("2026-03-01T08:00:00Z");
const later = new Date("2026-10-20T08:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("customer seats normalize", () => {
  it("writes the edited seats, leaves the rest and lists customers without one", async () => {
    addresses.seatsOf.mockResolvedValue([
      { id: "c1", companyName: "Alfa", registeredAddress: "Old 1, 110 00 Praha", city: "Praha", country: "CZ", createdAt: created,
        seat: { street: "New 2", city: "Brno", postalCode: "602 00", country: "CZ", updatedAt: later } },
      { id: "c2", companyName: "Beta", registeredAddress: "X, 1, Ostrava, 70200", city: "Ostrava", country: "CZ", createdAt: created,
        seat: { street: "X 1", city: "Ostrava", postalCode: "702 00", country: "CZ", updatedAt: created } },
      { id: "c3", companyName: "Gama", registeredAddress: "", city: "", country: "CZ", createdAt: created, seat: null },
    ]);
    addresses.applySeats.mockResolvedValue(1);
    await expect(customerSeatService.normalize(COMPANY)).resolves.toEqual({
      checked: 3, changed: 1, unmatched: [{ field: "registeredAddress", value: "Gama", count: 1 }],
    });
    expect(addresses.seatsOf).toHaveBeenCalledWith(COMPANY);
    expect(addresses.applySeats).toHaveBeenCalledWith(COMPANY, [
      { customerId: "c1", values: { registeredAddress: "New 2, 602 00 Brno", city: "Brno", country: "CZ" } },
    ]);
  });

  it("is run by a superadmin on their own company, and refused to everyone else", async () => {
    addresses.seatsOf.mockResolvedValue([]);
    addresses.applySeats.mockResolvedValue(0);
    const run = customerSeatNormalize as unknown as () => Promise<unknown>;
    auth.role = "superadmin";
    await expect(run()).resolves.toEqual({ checked: 0, changed: 0, unmatched: [] });
    expect(addresses.seatsOf).toHaveBeenCalledWith(COMPANY);
    vi.clearAllMocks();
    for (const role of ["admin", "manager", "user"]) {
      auth.role = role;
      await expect(run()).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(addresses.seatsOf).not.toHaveBeenCalled();
  });
});
