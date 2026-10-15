import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against stand-ins for the repositories.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../db/db", () => ({ db: {} }));
const customers = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const sites = vi.hoisted(() => ({
  findByCustomer: vi.fn(),
  createForCompany: vi.fn(),
  clearDefaultFlag: vi.fn(),
  getByIdForCompany: vi.fn(),
  updateForCompany: vi.fn(),
  softDeleteForCompany: vi.fn(),
}));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../../repositories/customerSite.repository", () => ({ customerSiteRepository: sites }));
vi.mock("../../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
vi.mock("../../services/logo.service", () => ({ logoService: { fetchLogo: vi.fn() } }));

import { customerSiteService } from "../../services/customerSite.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const now = new Date("2026-10-15T08:00:00Z");
const siteRow = (over: Record<string, unknown> = {}) => ({
  id: "s1", customerId: "c1", companyId: COMPANY, label: "Main warehouse", kind: "both", street: "Jankovcova 1522/53",
  postcode: "17000", city: "Praha 7", country: "CZ", lat: null, lng: null, openingHours: "", avizaceName: "",
  avizacePhone: "", avizaceEmail: "", loadingNotes: "", tailLiftNeeded: false, isDefault: false,
  createdAt: now, updatedAt: now, deletedAt: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("listing sites", () => {
  it("asks for the customer's sites within the company only, and hands out no company or deleted fields", async () => {
    sites.findByCustomer.mockResolvedValue([siteRow()]);
    const [item] = await customerSiteService.listByCustomer("c1", COMPANY);
    expect(sites.findByCustomer).toHaveBeenCalledWith("c1", COMPANY);
    expect(item).not.toHaveProperty("companyId");
    expect(item).not.toHaveProperty("deletedAt");
    expect(item!.createdAt).toBe(now.toISOString());
  });
});

describe("adding a site", () => {
  it("can't be done under a customer that isn't live in the company", async () => {
    customers.getByIdForCompany.mockResolvedValue(null);
    await expect(
      customerSiteService.create(COMPANY, "other-company-customer", { label: "X", postcode: "11000" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(customers.getByIdForCompany).toHaveBeenCalledWith("other-company-customer", COMPANY);
    expect(sites.createForCompany).not.toHaveBeenCalled();
  });

  it("stores a Czech postcode as 5 digits, with CZ and the other defaults filled in", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    sites.createForCompany.mockResolvedValue(siteRow());
    await customerSiteService.create(COMPANY, "c1", { label: "Main warehouse", postcode: "170 00" });
    expect(sites.createForCompany).toHaveBeenCalledWith(COMPANY, {
      customerId: "c1", label: "Main warehouse", kind: "both", street: "", postcode: "17000", city: "", country: "CZ",
      lat: null, lng: null, openingHours: "", avizaceName: "", avizacePhone: "", avizaceEmail: "", loadingNotes: "",
      tailLiftNeeded: false, isDefault: false,
    });
  });

  it("rejects a Czech postcode that is not 5 digits, before anything is written", async () => {
    await expect(customerSiteService.create(COMPANY, "c1", { label: "X", postcode: "1100" })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(sites.createForCompany).not.toHaveBeenCalled();
  });

  it("takes another country's postcode as typed, but not an empty one", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    sites.createForCompany.mockResolvedValue(siteRow());
    await customerSiteService.create(COMPANY, "c1", { label: "UK depot", postcode: " SW1A 1AA ", country: "gb" });
    expect(sites.createForCompany).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ postcode: "SW1A 1AA", country: "GB" }));
    await expect(
      customerSiteService.create(COMPANY, "c1", { label: "UK depot", postcode: " ", country: "GB" }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("rejects coordinates off the globe", async () => {
    await expect(
      customerSiteService.create(COMPANY, "c1", { label: "X", postcode: "11000", lat: 91 }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("as the default clears the flag on the customer's other sites first", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    sites.createForCompany.mockResolvedValue(siteRow({ isDefault: true }));
    await customerSiteService.create(COMPANY, "c1", { label: "X", postcode: "11000", isDefault: true });
    expect(sites.clearDefaultFlag).toHaveBeenCalledWith("c1", COMPANY);
  });
});

describe("changing a site", () => {
  it("is not found when the site belongs to another company", async () => {
    sites.getByIdForCompany.mockResolvedValue(null);
    await expect(customerSiteService.update("s1", COMPANY, { label: "X" })).rejects.toMatchObject({ code: "not_found" });
    expect(sites.getByIdForCompany).toHaveBeenCalledWith("s1", COMPANY);
    expect(sites.updateForCompany).not.toHaveBeenCalled();
  });

  it("writes only the fields sent", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow());
    sites.updateForCompany.mockResolvedValue(siteRow({ label: "Dock B" }));
    await customerSiteService.update("s1", COMPANY, { label: "Dock B" });
    expect(sites.updateForCompany).toHaveBeenCalledWith("s1", COMPANY, { label: "Dock B" });
  });

  it("checks a new postcode against the stored country", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ country: "CZ" }));
    sites.updateForCompany.mockResolvedValue(siteRow());
    await customerSiteService.update("s1", COMPANY, { postcode: "602 00" });
    expect(sites.updateForCompany).toHaveBeenCalledWith("s1", COMPANY, { country: "CZ", postcode: "60200" });
    await expect(customerSiteService.update("s1", COMPANY, { postcode: "D-80331" })).rejects.toMatchObject({
      code: "invalid_argument",
    });
  });

  it("checks the stored postcode against a new country", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ country: "GB", postcode: "SW1A 1AA" }));
    await expect(customerSiteService.update("s1", COMPANY, { country: "CZ" })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(sites.updateForCompany).not.toHaveBeenCalled();
  });

  it("as the default clears the flag on its own customer's sites, not on a client-sent one", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ customerId: "c1" }));
    sites.updateForCompany.mockResolvedValue(siteRow({ isDefault: true }));
    await customerSiteService.update("s1", COMPANY, { isDefault: true });
    expect(sites.clearDefaultFlag).toHaveBeenCalledWith("c1", COMPANY);
  });
});

describe("deleting a site", () => {
  it("is scoped to the company and reports a missing one", async () => {
    sites.softDeleteForCompany.mockResolvedValue(null);
    await expect(customerSiteService.softDelete("s1", COMPANY)).rejects.toMatchObject({ code: "not_found" });
    expect(sites.softDeleteForCompany).toHaveBeenCalledWith("s1", COMPANY);
  });
});
