import { beforeEach, describe, expect, it, vi } from "vitest";

const addresses = vi.hoisted(() => ({
  createForCompany: vi.fn(),
  updateForCompany: vi.fn(),
  softDeleteForCompany: vi.fn(),
}));
const requireLive = vi.hoisted(() => vi.fn());
vi.mock("../repositories/customerAddress.repository", () => ({ customerAddressRepository: addresses }));
vi.mock("../services/customer.service", () => ({ customerService: { requireLive } }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    invalidArgument: (msg: string) => new Error(msg),
    alreadyExists: (msg: string) => new Error(msg),
  },
}));

import { customerAddressService } from "../services/customerAddress.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const now = new Date("2026-10-14T08:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "a1", customerId: "c1", companyId: COMPANY, type: "Pickup", label: "", street: "Průmyslová 5", city: "Kolín", postalCode: "280 02",
  country: "CZ", createdAt: now, updatedAt: now, deletedAt: null, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("customer addresses", () => {
  it("are added under a live customer of the company, trimmed, the country in capitals", async () => {
    requireLive.mockResolvedValue({ id: "c1" });
    addresses.createForCompany.mockResolvedValue(row());
    const item = await customerAddressService.create(COMPANY, "c1", {
      type: "Pickup", label: " Plant ", street: " Průmyslová 5 ", city: "Kolín", postalCode: "280 02", country: "cz",
    });
    expect(requireLive).toHaveBeenCalledWith("c1", COMPANY);
    expect(addresses.createForCompany).toHaveBeenCalledWith(COMPANY, {
      customerId: "c1", type: "Pickup", label: "Plant", street: "Průmyslová 5", city: "Kolín", postalCode: "280 02", country: "CZ",
    });
    expect(item).not.toHaveProperty("companyId");
    expect(item.createdAt).toBe(now.toISOString());
  });

  it("can't be added under a customer that isn't live in the company", async () => {
    requireLive.mockRejectedValue(new Error("Customer not found"));
    await expect(
      customerAddressService.create(COMPANY, "x", { type: "Billing", street: "a", city: "b", postalCode: "c", country: "CZ" }),
    ).rejects.toThrow("Customer not found");
    expect(addresses.createForCompany).not.toHaveBeenCalled();
  });

  it("change only what is sent, and report one that is gone", async () => {
    addresses.updateForCompany.mockResolvedValueOnce(row({ city: "Praha" })).mockResolvedValueOnce(null);
    await customerAddressService.update("a1", COMPANY, { city: " Praha " });
    expect(addresses.updateForCompany).toHaveBeenCalledWith("a1", COMPANY, { city: "Praha" });
    await expect(customerAddressService.update("a1", COMPANY, { city: "Brno" })).rejects.toThrow("Address not found");
  });

  it("refuses a field of only spaces instead of storing it empty", async () => {
    await expect(customerAddressService.update("a1", COMPANY, { street: "   " })).rejects.toThrow("street is required");
    expect(addresses.updateForCompany).not.toHaveBeenCalled();
  });

  it("answers a second registered address plainly instead of with a 500", async () => {
    requireLive.mockResolvedValue({ id: "c1" });
    addresses.createForCompany.mockRejectedValueOnce(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }));
    await expect(
      customerAddressService.create(COMPANY, "c1", { type: "Registered", street: "A 1", city: "Praha", postalCode: "110 00", country: "CZ" }),
    ).rejects.toThrow("already has a registered address");
  });
});
