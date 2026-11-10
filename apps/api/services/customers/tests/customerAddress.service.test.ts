import { beforeEach, describe, expect, it, vi } from "vitest";

const addresses = vi.hoisted(() => ({
  createWithSeat: vi.fn(),
  updateWithSeat: vi.fn(),
  softDeleteWithSeat: vi.fn(),
  moveBilling: vi.fn(),
}));
const requireLive = vi.hoisted(() => vi.fn());
// Logo links are signed with a secret, which needs the Encore runtime.
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("../repositories/customerAddress.repository", () => ({ customerAddressRepository: addresses }));
vi.mock("../services/customer.service", () => ({ customerService: { requireLive } }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    invalidArgument: (msg: string) => new Error(msg),
    alreadyExists: (msg: string) => new Error(msg),
    aborted: (msg: string) => new Error(msg),
  },
}));

import { customerAddressService } from "../services/customerAddress.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const now = new Date("2026-10-14T08:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "a1", customerId: "c1", companyId: COMPANY, types: ["Pickup"], label: "", street: "Průmyslová 5", city: "Kolín", postalCode: "280 02",
  country: "CZ", createdAt: now, updatedAt: now, deletedAt: null, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("customer addresses", () => {
  it("are added under a live customer of the company, trimmed, the country in capitals", async () => {
    requireLive.mockResolvedValue({ id: "c1" });
    addresses.createWithSeat.mockResolvedValue(row());
    const item = await customerAddressService.create(COMPANY, "c1", {
      types: ["Pickup"], label: " Plant ", street: " Průmyslová 5 ", city: "Kolín", postalCode: "280 02", country: "cz",
    });
    expect(requireLive).toHaveBeenCalledWith("c1", COMPANY);
    expect(addresses.createWithSeat).toHaveBeenCalledWith(COMPANY, {
      customerId: "c1", types: ["Pickup"], label: "Plant", street: "Průmyslová 5", city: "Kolín", postalCode: "280 02", country: "CZ",
    });
    expect(item).not.toHaveProperty("companyId");
    expect(item.createdAt).toBe(now.toISOString());
  });

  it("keep each type once, in the list's order, and need at least one", async () => {
    requireLive.mockResolvedValue({ id: "c1" });
    addresses.createWithSeat.mockResolvedValue(row({ types: ["Registered", "Pickup", "Delivery"] }));
    const item = await customerAddressService.create(COMPANY, "c1", {
      types: ["Delivery", "Registered", "Pickup", "Delivery"], street: "a", city: "b", postalCode: "c", country: "CZ",
    });
    expect(addresses.createWithSeat).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ types: ["Registered", "Pickup", "Delivery"] }));
    expect(item.types).toEqual(["Registered", "Pickup", "Delivery"]);
    await expect(customerAddressService.update("a1", COMPANY, { types: [] })).rejects.toThrow("Choose at least one type");
    expect(addresses.updateWithSeat).not.toHaveBeenCalled();
  });

  it("can't be added under a customer that isn't live in the company", async () => {
    requireLive.mockRejectedValue(new Error("Customer not found"));
    await expect(
      customerAddressService.create(COMPANY, "x", { types: ["Billing"], street: "a", city: "b", postalCode: "c", country: "CZ" }),
    ).rejects.toThrow("Customer not found");
    expect(addresses.createWithSeat).not.toHaveBeenCalled();
  });

  it("change only what is sent, and report one that is gone", async () => {
    addresses.updateWithSeat.mockResolvedValueOnce(row({ city: "Praha" })).mockResolvedValueOnce(null);
    await customerAddressService.update("a1", COMPANY, { city: " Praha " });
    expect(addresses.updateWithSeat).toHaveBeenCalledWith("a1", COMPANY, { city: "Praha" });
    await expect(customerAddressService.update("a1", COMPANY, { city: "Brno" })).rejects.toThrow("Address not found");
  });

  it("refuses a field of only spaces instead of storing it empty", async () => {
    await expect(customerAddressService.update("a1", COMPANY, { street: "   " })).rejects.toThrow("street is required");
    expect(addresses.updateWithSeat).not.toHaveBeenCalled();
  });

  it("are deleted through the write that also keeps the customer's seat columns in step, and report one that is gone", async () => {
    addresses.softDeleteWithSeat.mockResolvedValueOnce(row({ types: ["Registered"] })).mockResolvedValueOnce(null);
    await customerAddressService.softDelete("a1", COMPANY);
    expect(addresses.softDeleteWithSeat).toHaveBeenCalledWith("a1", COMPANY);
    await expect(customerAddressService.softDelete("a1", COMPANY)).rejects.toThrow("Address not found");
  });

  it("answers a second registered address plainly instead of with a 500", async () => {
    requireLive.mockResolvedValue({ id: "c1" });
    addresses.createWithSeat.mockRejectedValueOnce(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }));
    await expect(
      customerAddressService.create(COMPANY, "c1", { types: ["Registered"], street: "A 1", city: "Praha", postalCode: "110 00", country: "CZ" }),
    ).rejects.toThrow("already has a registered address");
  });

  it("tells a second billing address apart from a second registered address", async () => {
    requireLive.mockResolvedValue({ id: "c1" });
    const second = Object.assign(new Error("Failed query"), { cause: { code: "23505", constraint: "customer_address_one_billing" } });
    addresses.createWithSeat.mockRejectedValueOnce(second);
    await expect(
      customerAddressService.create(COMPANY, "c1", { types: ["Billing"], street: "A 1", city: "Praha", postalCode: "110 00", country: "CZ" }),
    ).rejects.toThrow("add this one without Billing");
    // Moving Billing at the same moment as somebody else: reload, not "use Use for invoices".
    addresses.moveBilling.mockRejectedValueOnce(second);
    await expect(customerAddressService.makeBilling("a1", COMPANY)).rejects.toThrow("changed by someone else at the same moment");
  });

  it("makes an address the billing address through the write that moves Billing, and reports one that is gone", async () => {
    addresses.moveBilling.mockResolvedValueOnce(row({ types: ["Billing", "Pickup"] }));
    const item = await customerAddressService.makeBilling("a1", COMPANY);
    expect(addresses.moveBilling).toHaveBeenCalledWith("a1", COMPANY);
    expect(item.types).toEqual(["Billing", "Pickup"]);
    addresses.moveBilling.mockResolvedValueOnce(null);
    await expect(customerAddressService.makeBilling("gone", COMPANY)).rejects.toThrow("Address not found");
  });

  it("tells a site given to the address by another save at the same moment apart from a second registered address", async () => {
    const race = Object.assign(new Error("Failed query"), { cause: { code: "23505", constraint: "customer_site_one_per_address" } });
    addresses.updateWithSeat.mockRejectedValueOnce(race);
    await expect(customerAddressService.update("a1", COMPANY, { types: ["Pickup"] })).rejects.toThrow("changed by someone else at the same moment");
  });
});
