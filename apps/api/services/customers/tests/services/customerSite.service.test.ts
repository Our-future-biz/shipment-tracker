import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against stand-ins for the repositories.
// Logo links are signed with a secret, which needs the Encore runtime.
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../db/db", () => ({ db: {} }));
// customer.service (requireLive) also loads the auth client and ARES (which logs).
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn() } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
const customers = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const sites = vi.hoisted(() => ({
  findByCustomer: vi.fn(),
  createForCompany: vi.fn(),
  getByIdForCompany: vi.fn(),
  updateInCustomer: vi.fn(),
  softDeleteForCompany: vi.fn(),
  findByAddress: vi.fn(),
}));
const addresses = vi.hoisted(() => ({ createWithSeat: vi.fn(), updateWithSeat: vi.fn(), softDeleteWithSeat: vi.fn(), findLive: vi.fn() }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../../repositories/customerSite.repository", () => ({ customerSiteRepository: sites }));
vi.mock("../../repositories/customerAddress.repository", () => ({ customerAddressRepository: addresses }));
vi.mock("../../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
vi.mock("../../services/logo.service", () => ({ logoService: { fetchLogo: vi.fn() } }));
// The change events need the Encore runtime.
vi.mock("../../topics", () => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }));

import { customerSiteService } from "../../services/customerSite.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const now = new Date("2026-10-15T08:00:00Z");
const siteRow = (over: Record<string, unknown> = {}) => ({
  id: "s1", customerId: "c1", companyId: COMPANY, addressId: null, label: "Main warehouse", kind: "both", street: "Jankovcova 1522/53",
  postcode: "17000", city: "Praha 7", country: "CZ", lat: null, lng: null, openingHours: "", avizaceName: "",
  avizacePhone: "", avizaceEmail: "", loadingNotes: "", tailLiftNeeded: false, isDefault: false,
  createdAt: now, updatedAt: now, deletedAt: null, ...over,
});
const addressRow = (over: Record<string, unknown> = {}) => ({
  id: "a1", customerId: "c1", companyId: COMPANY, types: ["Pickup", "Delivery"], label: "Main warehouse", street: "Jankovcova 1522/53",
  city: "Praha 7", postalCode: "170 00", country: "CZ", createdAt: now, updatedAt: now, deletedAt: null, ...over,
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
    expect(addresses.createWithSeat).not.toHaveBeenCalled();
  });

  it("adds it as a Pickup and Delivery address of the customer, with the site's own details written with it", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    addresses.createWithSeat.mockResolvedValue(addressRow());
    sites.findByAddress.mockResolvedValue(siteRow({ addressId: "a1" }));
    const site = await customerSiteService.create(COMPANY, "c1", { label: " Main warehouse ", postcode: "170 00", openingHours: "7-15", tailLiftNeeded: true });
    expect(addresses.createWithSeat).toHaveBeenCalledWith(
      COMPANY,
      { customerId: "c1", types: ["Pickup", "Delivery"], label: "Main warehouse", street: "", city: "", postalCode: "170 00", country: "CZ" },
      { openingHours: "7-15", tailLiftNeeded: true },
    );
    expect(sites.findByAddress).toHaveBeenCalledWith("a1", COMPANY);
    expect(site.addressId).toBe("a1");
    expect(sites.createForCompany).not.toHaveBeenCalled();
  });

  it("says which rule a save at the same moment broke: a second site of the address, or a second default", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    const unique = (constraint: string) => Object.assign(new Error("Failed query"), { cause: { code: "23505", constraint } });
    addresses.createWithSeat.mockRejectedValueOnce(unique("customer_site_one_per_address"));
    await expect(customerSiteService.create(COMPANY, "c1", { label: "Dock", postcode: "11000" })).rejects.toMatchObject({
      code: "aborted",
      message: expect.stringContaining("changed by someone else"),
    });
    addresses.createWithSeat.mockRejectedValueOnce(unique("customer_site_one_default"));
    await expect(customerSiteService.create(COMPANY, "c1", { label: "Dock", postcode: "11000", isDefault: true })).rejects.toMatchObject({
      code: "aborted",
      message: expect.stringContaining("made the default"),
    });
  });

  it("used for loading only is a Pickup address", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    addresses.createWithSeat.mockResolvedValue(addressRow({ types: ["Pickup"] }));
    sites.findByAddress.mockResolvedValue(siteRow({ addressId: "a1", kind: "loading" }));
    await customerSiteService.create(COMPANY, "c1", { label: "Dock", postcode: "11000", kind: "loading" });
    expect(addresses.createWithSeat).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ types: ["Pickup"] }), {});
  });

  it("rejects a Czech postcode that is not 5 digits, before anything is written", async () => {
    await expect(customerSiteService.create(COMPANY, "c1", { label: "X", postcode: "1100" })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(addresses.createWithSeat).not.toHaveBeenCalled();
  });

  it("takes another country's postcode as typed, but not an empty one", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    addresses.createWithSeat.mockResolvedValue(addressRow());
    sites.findByAddress.mockResolvedValue(siteRow());
    await customerSiteService.create(COMPANY, "c1", { label: "UK depot", postcode: " SW1A 1AA ", country: "gb" });
    expect(addresses.createWithSeat).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ postalCode: "SW1A 1AA", country: "GB" }), {});
    await expect(
      customerSiteService.create(COMPANY, "c1", { label: "UK depot", postcode: " ", country: "GB" }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("rejects coordinates off the globe", async () => {
    await expect(
      customerSiteService.create(COMPANY, "c1", { label: "X", postcode: "11000", lat: 91 }),
    ).rejects.toMatchObject({ code: "invalid_argument" });
  });

  // Changed: the flag used to be cleared by a call of its own before the write; now the address
  // write clears it in its own transaction (customerAddress.repository syncSite).
  it("as the default is made so in the address's write, which clears the flag on the customer's other sites", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    addresses.createWithSeat.mockResolvedValue(addressRow());
    sites.findByAddress.mockResolvedValue(siteRow({ isDefault: true }));
    await customerSiteService.create(COMPANY, "c1", { label: "X", postcode: "11000", isDefault: true });
    expect(addresses.createWithSeat).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ customerId: "c1" }), { isDefault: true });
  });
});

describe("changing a site", () => {
  it("is not found when the site belongs to another company", async () => {
    sites.getByIdForCompany.mockResolvedValue(null);
    await expect(customerSiteService.update("s1", COMPANY, { label: "X" })).rejects.toMatchObject({ code: "not_found" });
    expect(sites.getByIdForCompany).toHaveBeenCalledWith("s1", COMPANY);
    expect(sites.updateInCustomer).not.toHaveBeenCalled();
  });

  it("writes only the fields sent", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow());
    sites.updateInCustomer.mockResolvedValue(siteRow({ label: "Dock B" }));
    await customerSiteService.update("s1", COMPANY, { label: "Dock B" });
    expect(sites.updateInCustomer).toHaveBeenCalledWith("s1", COMPANY, "c1", { label: "Dock B" });
  });

  it("checks a new postcode against the stored country", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ country: "CZ" }));
    sites.updateInCustomer.mockResolvedValue(siteRow());
    await customerSiteService.update("s1", COMPANY, { postcode: "602 00" });
    expect(sites.updateInCustomer).toHaveBeenCalledWith("s1", COMPANY, "c1", { country: "CZ", postcode: "60200" });
    await expect(customerSiteService.update("s1", COMPANY, { postcode: "D-80331" })).rejects.toMatchObject({
      code: "invalid_argument",
    });
  });

  it("checks the stored postcode against a new country", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ country: "GB", postcode: "SW1A 1AA" }));
    await expect(customerSiteService.update("s1", COMPANY, { country: "CZ" })).rejects.toMatchObject({
      code: "invalid_argument",
    });
    expect(sites.updateInCustomer).not.toHaveBeenCalled();
  });

  // Changed: cleared in the write's own transaction (customerSite.repository updateInCustomer), not before it.
  it("as the default clears the flag on its own customer's sites, not on a client-sent one, in the write itself", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ customerId: "c1" }));
    sites.updateInCustomer.mockResolvedValue(siteRow({ isDefault: true }));
    await customerSiteService.update("s1", COMPANY, { isDefault: true });
    expect(sites.updateInCustomer).toHaveBeenCalledWith("s1", COMPANY, "c1", { isDefault: true });
  });
});

describe("changing a site of an address", () => {
  it("changes the address, its use the address's Pickup / Delivery, the other types kept, and the site's own details with it", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ addressId: "a1" }));
    addresses.findLive.mockResolvedValue(addressRow({ types: ["Registered", "Pickup", "Delivery"] }));
    addresses.updateWithSeat.mockResolvedValue(addressRow());
    sites.findByAddress.mockResolvedValue(siteRow({ addressId: "a1", label: "Dock B" }));
    await customerSiteService.update("s1", COMPANY, { label: "Dock B", kind: "loading", openingHours: "6-14" });
    expect(addresses.updateWithSeat).toHaveBeenCalledWith("a1", COMPANY, { label: "Dock B", types: ["Registered", "Pickup"] }, { openingHours: "6-14" });
    expect(sites.updateInCustomer).not.toHaveBeenCalled();
  });

  it("keeps the postcode as typed on the address, checked for the country", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ addressId: "a1" }));
    addresses.findLive.mockResolvedValue(addressRow());
    addresses.updateWithSeat.mockResolvedValue(addressRow());
    sites.findByAddress.mockResolvedValue(siteRow({ addressId: "a1" }));
    await customerSiteService.update("s1", COMPANY, { postcode: "602 00" });
    expect(addresses.updateWithSeat).toHaveBeenCalledWith("a1", COMPANY, { country: "CZ", postalCode: "602 00" }, {});
    await expect(customerSiteService.update("s1", COMPANY, { postcode: "6020" })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("deleting a site", () => {
  it("is scoped to the company and reports a missing one", async () => {
    sites.getByIdForCompany.mockResolvedValue(null);
    await expect(customerSiteService.softDelete("s1", COMPANY, true)).rejects.toMatchObject({ code: "not_found" });
    expect(sites.getByIdForCompany).toHaveBeenCalledWith("s1", COMPANY);
    sites.getByIdForCompany.mockResolvedValue(siteRow());
    sites.softDeleteForCompany.mockResolvedValue(null);
    await expect(customerSiteService.softDelete("s1", COMPANY, true)).rejects.toMatchObject({ code: "not_found" });
    expect(sites.softDeleteForCompany).toHaveBeenCalledWith("s1", COMPANY);
  });

  it("takes Pickup and Delivery off its address, and the address goes too when nothing else is left of it", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ addressId: "a1" }));
    addresses.findLive.mockResolvedValue(addressRow({ types: ["Registered", "Pickup"] }));
    addresses.updateWithSeat.mockResolvedValue(addressRow({ types: ["Registered"] }));
    await customerSiteService.softDelete("s1", COMPANY, true);
    expect(addresses.updateWithSeat).toHaveBeenCalledWith("a1", COMPANY, { types: ["Registered"] });
    addresses.findLive.mockResolvedValue(addressRow({ types: ["Pickup", "Delivery"] }));
    addresses.softDeleteWithSeat.mockResolvedValue(addressRow());
    await customerSiteService.softDelete("s1", COMPANY, true);
    expect(addresses.softDeleteWithSeat).toHaveBeenCalledWith("a1", COMPANY);
    expect(sites.softDeleteForCompany).not.toHaveBeenCalled();
  });

  it("deletes the address with it only for someone who may delete addresses; taking Pickup / Delivery off is anyone's", async () => {
    sites.getByIdForCompany.mockResolvedValue(siteRow({ addressId: "a1" }));
    addresses.findLive.mockResolvedValue(addressRow({ types: ["Pickup", "Delivery"] }));
    await expect(customerSiteService.softDelete("s1", COMPANY, false)).rejects.toMatchObject({ code: "permission_denied" });
    expect(addresses.softDeleteWithSeat).not.toHaveBeenCalled();
    addresses.findLive.mockResolvedValue(addressRow({ types: ["Billing", "Pickup"] }));
    addresses.updateWithSeat.mockResolvedValue(addressRow({ types: ["Billing"] }));
    await customerSiteService.softDelete("s1", COMPANY, false);
    expect(addresses.updateWithSeat).toHaveBeenCalledWith("a1", COMPANY, { types: ["Billing"] });
  });
});
