import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const userLookup = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup } }));
const ratings = vi.hoisted(() => ({ setRating: vi.fn(), listForCustomer: vi.fn() }));
vi.mock("../repositories/customerSupplierRating.repository", () => ({ customerSupplierRatingRepository: ratings }));
const requireLive = vi.hoisted(() => vi.fn());
vi.mock("../services/customer.service", () => ({ customerService: { requireLive } }));

import { supplierRatingService } from "../services/supplierRating.service";
import { isSupplier } from "../interfaces/interfaces";

const now = new Date("2026-11-04T08:00:00Z");
const MANAGER = { userID: "u1", role: "manager" };
const haulier = { id: "c1", roles: ["haulier"] };

// The customer row the repository hands back after a write: what the write set, on a stored row.
const rowAfter = (write: { rating: number | null; reason: string; setBy: string; setByUserId: string | null }) => ({
  id: "c1", companyId: "co", ico: "", dic: "", companyName: "Kovo Doprava s.r.o.", legalForm: "", registeredAddress: "", city: "", country: "CZ",
  registrationDate: null, nace: "", industry: "", typicalCargo: "", stability: "", riskLevel: "", dataSource: "ARES", lastRegistryUpdate: "",
  status: "Prospect", salesOwner: "", salesOwnerUserId: null, label: "TARGET CUSTOMER", creditLimit: 0, currency: "EUR", secondaryCurrencies: [],
  paymentTerms: "", freightPaymentTerms: "", dutyPaymentTerms: "", roles: ["haulier"], companyWebsite: "", logoData: "", logoSource: "", logoUpdatedAt: "",
  totalRevenue: 0, totalProfit: 0, totalShipments: 0, lastActivityDate: null,
  supplierRating: write.rating, supplierRatingReason: write.reason, supplierRatingBy: write.rating === null ? "" : write.setBy,
  supplierRatingByUserId: write.rating === null ? null : write.setByUserId, supplierRatingAt: write.rating === null ? null : now,
  createdAt: now, updatedAt: now, deletedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  userLookup.mockResolvedValue({ users: [{ id: "u1", email: "Martin@OurFuture.biz" }] });
  requireLive.mockResolvedValue(haulier);
  ratings.setRating.mockImplementation(async (_co: string, _id: string, write: Parameters<typeof rowAfter>[0]) => rowAfter(write));
});

describe("a supplier's rating", () => {
  it("is set by a manager, stamped with their e-mail from the login, the reason trimmed", async () => {
    const customer = await supplierRatingService.set("co", "c1", MANAGER, { rating: 4, reason: "  On time all summer " });
    expect(ratings.setRating).toHaveBeenCalledWith("co", "c1", { rating: 4, reason: "On time all summer", setBy: "martin@ourfuture.biz", setByUserId: "u1" });
    expect(customer).toMatchObject({ supplierRating: 4, supplierRatingReason: "On time all summer", supplierRatingBy: "martin@ourfuture.biz", supplierRatingAt: now.toISOString() });
  });

  it("may be 0, the worst, which is not the same as not rated", async () => {
    const zero = await supplierRatingService.set("co", "c1", MANAGER, { rating: 0, reason: "Two lost pallets" });
    expect(zero.supplierRating).toBe(0);
    const cleared = await supplierRatingService.set("co", "c1", MANAGER, { rating: null, reason: "left over" });
    expect(cleared.supplierRating).toBeNull();
    expect(cleared.supplierRatingAt).toBeNull();
    expect(ratings.setRating).toHaveBeenLastCalledWith("co", "c1", expect.objectContaining({ rating: null, reason: "" }));
  });

  it("is refused to anyone who does not manage Sales, before anything is read", async () => {
    for (const role of ["user", "", "Manager"]) {
      await expect(supplierRatingService.set("co", "c1", { userID: "u2", role }, { rating: 5 })).rejects.toThrow(/Only a manager/);
    }
    expect(requireLive).not.toHaveBeenCalled();
    expect(ratings.setRating).not.toHaveBeenCalled();
  });

  it("is a whole number of stars from 0 to 5", async () => {
    for (const rating of [2.5, 6, -1, Number.NaN]) {
      await expect(supplierRatingService.set("co", "c1", MANAGER, { rating, reason: "x" })).rejects.toThrow(/whole number/);
    }
    expect(ratings.setRating).not.toHaveBeenCalled();
  });

  it("needs a reason at 0, 1 or 2 stars, not above", async () => {
    for (const rating of [0, 1, 2]) {
      await expect(supplierRatingService.set("co", "c1", MANAGER, { rating, reason: "   " })).rejects.toThrow(/reason/);
    }
    await supplierRatingService.set("co", "c1", MANAGER, { rating: 3 });
    expect(ratings.setRating).toHaveBeenCalledWith("co", "c1", expect.objectContaining({ rating: 3, reason: "" }));
  });

  it("is only for a company with a supplier role", async () => {
    requireLive.mockResolvedValue({ id: "c1", roles: ["customer"] });
    await expect(supplierRatingService.set("co", "c1", MANAGER, { rating: 5 })).rejects.toThrow(/Only a supplier/);
    expect(ratings.setRating).not.toHaveBeenCalled();
  });

  it("is refused for a customer that is gone by the time it is written", async () => {
    ratings.setRating.mockResolvedValue(null);
    await expect(supplierRatingService.set("co", "c1", MANAGER, { rating: 5 })).rejects.toThrow(/not found/i);
  });

  it("keeps every change, newest first, as it was made", async () => {
    ratings.listForCustomer.mockResolvedValue([
      { id: "h2", companyId: "co", customerId: "c1", rating: null, reason: "", setBy: "lukas@ourfuture.biz", setByUserId: "u3", createdAt: now, updatedAt: now, deletedAt: null },
      { id: "h1", companyId: "co", customerId: "c1", rating: 2, reason: "Late PODs", setBy: "martin@ourfuture.biz", setByUserId: "u1", createdAt: now, updatedAt: now, deletedAt: null },
    ]);
    expect(await supplierRatingService.history("co", "c1")).toEqual([
      { id: "h2", rating: null, reason: "", setBy: "lukas@ourfuture.biz", setAt: now.toISOString() },
      { id: "h1", rating: 2, reason: "Late PODs", setBy: "martin@ourfuture.biz", setAt: now.toISOString() },
    ]);
    expect(requireLive).toHaveBeenCalledWith("c1", "co");
  });
});

describe("isSupplier", () => {
  it("is any role but customer, also beside it", () => {
    expect(isSupplier(["customer"])).toBe(false);
    expect(isSupplier(["haulier"])).toBe(true);
    expect(isSupplier(["customer", "co_loader"])).toBe(true);
    expect(isSupplier(["rail_operator", "first_last_mile_haulier", "shipping_line"])).toBe(true);
  });
});
