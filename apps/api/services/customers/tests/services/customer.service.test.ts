import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against a stand-in for the repository.
// Logo links are signed with a secret, which needs the Encore runtime.
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../db/db", () => ({ db: {} }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn(), userLookup: vi.fn() } }));
vi.mock("../../repositories/customer.repository", () => ({
  customerRepository: {
    pipelineList: vi.fn(),
    listFiltered: vi.fn(),
    listWithRole: vi.fn(),
    findByIco: vi.fn(),
    createWithContact: vi.fn(),
    getByIdForCompany: vi.fn(),
    updateForCompany: vi.fn(),
    updateLocked: vi.fn(),
    activate: vi.fn(),
  },
}));
vi.mock("../../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
// The change events need the Encore runtime; what is published is checked in ../customer.service.test.ts.
vi.mock("../../topics", () => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }));

import { customerRepository } from "../../repositories/customer.repository";
import { aresService } from "../../services/ares.service";
import { auth } from "~encore/clients";
import { assertMayGiveRoles, customerService } from "../../services/customer.service";

const repository = vi.mocked(customerRepository);
const ares = vi.mocked(aresService);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

// Only what the mapper reads; the rest of a row does not matter to these tests.
const customerRow = (over: Record<string, unknown> = {}) =>
  ({
    id: "customer-1", companyName: "ITTEC, s.r.o.", roles: ["customer"], registrationDate: null, lastActivityDate: null,
    createdAt: new Date("2026-09-01T08:00:00.000Z"), updatedAt: new Date("2026-09-01T08:00:00.000Z"), ...over,
  }) as never;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("pipelineList", () => {
  it("hands out the company's customers as the pipeline needs them, the creation time as an ISO string", async () => {
    repository.pipelineList.mockResolvedValue([
      { id: "customer-1", companyName: "ITTEC, s.r.o.", status: "Prospect", label: "TARGET CUSTOMER", salesOwner: "Martin", roles: ["customer" as const], createdAt: new Date("2026-09-01T08:00:00.123Z") },
      { id: "customer-2", companyName: "RAVAK a.s.", status: "Active", label: "KEY ACCOUNT", salesOwner: "", roles: ["customer" as const], createdAt: new Date("2026-08-01T08:00:00.000Z") },
    ]);
    await expect(customerService.pipelineList(COMPANY)).resolves.toEqual([
      { id: "customer-1", companyName: "ITTEC, s.r.o.", status: "Prospect", label: "TARGET CUSTOMER", salesOwner: "Martin", roles: ["customer"], createdAt: "2026-09-01T08:00:00.123Z" },
      { id: "customer-2", companyName: "RAVAK a.s.", status: "Active", label: "KEY ACCOUNT", salesOwner: "", roles: ["customer"], createdAt: "2026-08-01T08:00:00.000Z" },
    ]);
    expect(repository.pipelineList).toHaveBeenCalledWith(COMPANY);
  });
});

describe("roles", () => {
  const CONTACT = { firstName: "Jana", lastName: "Nová", email: "jana@example.cz" };

  it("are passed on as a list filter, and every item carries its roles", async () => {
    repository.listFiltered.mockResolvedValue({ rows: [customerRow({ roles: ["customer", "haulier"] })], total: 1 });
    const { data: [item], total } = await customerService.list(COMPANY, { role: "haulier" });
    expect(repository.listFiltered).toHaveBeenCalledWith(COMPANY, { role: "haulier" });
    expect(item!.roles).toEqual(["customer", "haulier"]);
    expect(total).toBe(1);
  });

  it("are filtered on the server with the owner, supplier types and rating a user asks for", async () => {
    repository.listFiltered.mockResolvedValue({ rows: [], total: 0 });
    await customerService.listFor(COMPANY, "user-7", { kind: "suppliers", owner: "mine", types: "haulier, shipping_line", rating: "3" });
    expect(repository.listFiltered).toHaveBeenLastCalledWith(COMPANY, { kind: "suppliers", salesOwner: "user-7", anyRole: ["haulier", "shipping_line"], rating: { min: 3 } });
    await customerService.listFor(COMPANY, "user-7", { owner: "none", rating: "low" });
    expect(repository.listFiltered).toHaveBeenLastCalledWith(COMPANY, { salesOwner: "none", rating: { max: 2 } });
    await customerService.listFor(COMPANY, "user-7", { rating: "none", types: "" });
    expect(repository.listFiltered).toHaveBeenLastCalledWith(COMPANY, { rating: "unrated" });
    await expect(customerService.listFor(COMPANY, "user-7", { types: "customer" })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("make a new company a customer unless others are given", async () => {
    repository.findByIco.mockResolvedValue(null);
    ares.lookup.mockResolvedValue({ ico: "12345678", registrationDate: "" } as never);
    repository.createWithContact.mockResolvedValue(customerRow());
    await customerService.createFromAres(COMPANY, "user", "12345678", CONTACT);
    expect(repository.createWithContact).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ roles: ["customer"] }), expect.anything(), expect.anything());

    await customerService.createFromAres(COMPANY, "manager", "12345678", CONTACT, ["haulier"]);
    expect(repository.createWithContact).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ roles: ["haulier"] }), expect.anything(), expect.anything());
  });

  // A change of roles is worked out with the row locked: `current` is the row as the lock reads it, and the
  // values the change writes are kept in `written`.
  let written: Record<string, unknown> | null = null;
  const lockedOn = (current: Record<string, unknown>) =>
    repository.updateLocked.mockImplementation(async (_id, _company, work) => {
      written = (await work(customerRow(current))) as Record<string, unknown> | null;
      return customerRow({ ...current, ...written });
    });

  it("are stored once each when changed, with the row locked", async () => {
    lockedOn({ roles: ["customer", "haulier"] });
    await customerService.update("customer-1", COMPANY, "manager", { roles: ["haulier", "customer", "haulier"] });
    expect(repository.updateLocked).toHaveBeenCalledWith("customer-1", COMPANY, expect.any(Function));
    expect(written).toEqual({ roles: ["haulier", "customer"] });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("make a supplier only that becomes a customer a Prospect, unless a status is sent with them (K14)", async () => {
    lockedOn({ roles: ["haulier"], status: "Active" });
    await customerService.update("customer-1", COMPANY, "manager", { roles: ["haulier", "customer"] });
    expect(written).toEqual({ roles: ["haulier", "customer"], status: "Prospect" });
    await customerService.update("customer-1", COMPANY, "manager", { roles: ["haulier", "customer"], status: "Active" });
    expect(written).toEqual(expect.objectContaining({ status: "Active" }));
  });

  it("keep a customer stored Inactive that becomes a supplier only in use as one, unless a status is sent with them", async () => {
    lockedOn({ roles: ["customer", "haulier"], status: "Inactive" });
    await customerService.update("customer-1", COMPANY, "manager", { roles: ["haulier"] });
    expect(written).toEqual({ roles: ["haulier"], status: "Active" });
    await customerService.update("customer-1", COMPANY, "manager", { roles: ["haulier"], status: "Inactive" });
    expect(written).toEqual({ roles: ["haulier"], status: "Inactive" });
    lockedOn({ roles: ["customer", "haulier"], status: "Prospect" });
    await customerService.update("customer-1", COMPANY, "manager", { roles: ["haulier"] });
    expect(written).toEqual({ roles: ["haulier"] });
  });

  it("are checked whole before anything is written: a bad registration date refuses the change of roles", async () => {
    lockedOn({ roles: ["customer"] });
    await expect(customerService.update("customer-1", COMPANY, "manager", { roles: ["customer", "haulier"], registrationDate: "31.2.2020" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.updateLocked).not.toHaveBeenCalled();
  });

  it("can't be emptied: a company always has at least one role", async () => {
    await expect(customerService.update("customer-1", COMPANY, "manager", { roles: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(customerService.createFromAres(COMPANY, "manager", "12345678", CONTACT, [])).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(repository.createWithContact).not.toHaveBeenCalled();
  });

  it("are changed only by a manager (a haulier role reaches Trucking and its payables)", async () => {
    await expect(customerService.update("customer-1", COMPANY, "user", { roles: ["haulier"] })).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("with a supplier role are given to a new company only by a manager", () => {
    expect(() => assertMayGiveRoles("user", ["customer", "rail_operator"])).toThrow(expect.objectContaining({ code: "permission_denied" }));
    expect(() => assertMayGiveRoles("user", ["customer"])).not.toThrow();
    expect(() => assertMayGiveRoles("user", undefined)).not.toThrow();
    expect(() => assertMayGiveRoles("manager", ["rail_operator"])).not.toThrow();
    expect(() => assertMayGiveRoles("user", ["first_last_mile_haulier"])).toThrow(expect.objectContaining({ code: "permission_denied" }));
    expect(() => assertMayGiveRoles("manager", ["customer", "first_last_mile_haulier"])).not.toThrow();
    expect(() => assertMayGiveRoles("user", ["shipping_line"])).toThrow(expect.objectContaining({ code: "permission_denied" }));
    expect(() => assertMayGiveRoles("user", ["co_loader"])).toThrow(expect.objectContaining({ code: "permission_denied" }));
    expect(() => assertMayGiveRoles("manager", ["customer", "co_loader"])).not.toThrow();
    expect(() => assertMayGiveRoles("user", ["haulier"])).toThrow(expect.objectContaining({ code: "permission_denied" }));
  });

  it("with a supplier role are refused to a plain user on either create, before the registry or the database is asked", async () => {
    await expect(customerService.createFromAres(COMPANY, "user", "12345678", CONTACT, ["customer", "rail_operator"])).rejects.toMatchObject({ code: "permission_denied" });
    const manual = { country: "DE", companyName: "Hapag-Lloyd AG", street: "Ballindamm 25", city: "Hamburg", postalCode: "20095", contact: CONTACT };
    await expect(customerService.createManual(COMPANY, "user", { ...manual, roles: ["shipping_line"] })).rejects.toMatchObject({ code: "permission_denied" });
    expect(ares.lookup).not.toHaveBeenCalled();
    expect(repository.findByIco).not.toHaveBeenCalled();
    expect(repository.createWithContact).not.toHaveBeenCalled();

    repository.createWithContact.mockResolvedValue(customerRow({ roles: ["shipping_line"] }));
    await customerService.createManual(COMPANY, "manager", { ...manual, roles: ["shipping_line"] });
    expect(repository.createWithContact).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ roles: ["shipping_line"] }), expect.anything(), expect.anything());
  });

  it("with a supplier role are let to a plain user from a quote, waiting for a manager's approval", async () => {
    expect(() => assertMayGiveRoles("user", ["shipping_line"], true)).not.toThrow();
    // From a quote it is a supplier: it needs a supplier role.
    expect(() => assertMayGiveRoles("user", ["customer"], true)).toThrow(expect.objectContaining({ code: "invalid_argument" }));
    const USER = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
    vi.mocked(auth.userLookup).mockResolvedValue({ users: [{ id: USER, email: "Rep@Firm.cz", displayName: "Rep" }] } as never);
    repository.findByIco.mockResolvedValue(null);
    repository.createWithContact.mockResolvedValue(customerRow({ roles: ["shipping_line"], approvalStatus: "pending" }));
    const manual = { country: "DE", companyName: "Hapag-Lloyd AG", street: "Ballindamm 25", city: "Hamburg", postalCode: "20095", contact: CONTACT, roles: ["shipping_line" as const] };
    await customerService.createManual(COMPANY, "user", manual, { userId: USER, quoteNumber: "QCZ20261105001" });
    expect(repository.createWithContact).toHaveBeenLastCalledWith(
      COMPANY,
      expect.objectContaining({ approvalStatus: "pending", approvalRequestedBy: "rep@firm.cz", approvalRequestedByUserId: USER, approvalQuoteNumber: "QCZ20261105001" }),
      expect.anything(),
      expect.anything(),
    );
    // A manager's own is approved at once: nothing waits.
    await customerService.createManual(COMPANY, "manager", manual, { userId: USER, quoteNumber: "QCZ20261105001" });
    expect(repository.createWithContact.mock.lastCall?.[1]).not.toHaveProperty("approvalStatus");
  });

  it("list the companies with a role, asking only for ids that can be customers", async () => {
    repository.listWithRole.mockResolvedValue([]);
    await customerService.listWithRole(COMPANY, "rail_operator");
    expect(repository.listWithRole).toHaveBeenCalledWith(COMPANY, "rail_operator", undefined);
    await customerService.listWithRole(COMPANY, "rail_operator", ["not-a-uuid", "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f"]);
    expect(repository.listWithRole).toHaveBeenLastCalledWith(COMPANY, "rail_operator", ["6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f"]);
    repository.listWithRole.mockClear();
    await expect(customerService.listWithRole(COMPANY, "rail_operator", ["not-a-uuid"])).resolves.toEqual([]);
    await expect(customerService.listWithRole(COMPANY, "haulier", [])).resolves.toEqual([]);
    expect(repository.listWithRole).not.toHaveBeenCalled();
  });

  it("stay as they are when a change does not send them", async () => {
    repository.updateForCompany.mockResolvedValue(customerRow());
    await customerService.update("customer-1", COMPANY, "user", { companyName: "ITTEC" });
    expect(repository.updateForCompany).toHaveBeenCalledWith("customer-1", COMPANY, { companyName: "ITTEC" });
  });
});

describe("activate", () => {
  it("is one conditional write in the repository: true when a row changed", async () => {
    repository.activate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(customerService.activate("customer-1", COMPANY)).resolves.toBe(true);
    // Already Active, deleted or of another company: nothing matched, nothing written.
    await expect(customerService.activate("customer-1", COMPANY)).resolves.toBe(false);
    expect(repository.activate).toHaveBeenCalledWith("customer-1", COMPANY);
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });
});
