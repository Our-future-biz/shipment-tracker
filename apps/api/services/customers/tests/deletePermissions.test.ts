import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest: api() hands back the handler, and the signed-in
// user comes from a stubbed getAuthData.
const auth = vi.hoisted(() => ({ role: "superadmin" }));
vi.mock("encore.dev/api", () => ({
  api: (_opts: unknown, handler: unknown) => handler,
  APIError: {
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    unauthenticated: (msg: string) => new Error(msg),
  },
}));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: auth.role }) }));

const softDeletes = vi.hoisted(() => ({ customer: vi.fn(), contact: vi.fn(), address: vi.fn() }));
const deletedCustomers = vi.hoisted(() => ({ listDeleted: vi.fn(async () => []), restore: vi.fn(async () => ({ id: "x1" })) }));
vi.mock("../services/customer.service", () => ({ customerService: { softDelete: softDeletes.customer, ...deletedCustomers } }));
vi.mock("../services/contact.service", () => ({ contactService: { softDelete: softDeletes.contact } }));
vi.mock("../services/customerAddress.service", () => ({ customerAddressService: { softDelete: softDeletes.address } }));

import { customerDelete } from "../controllers/customerDelete.controller";
import { contactDelete } from "../controllers/contactDelete.controller";
import { addressDelete } from "../controllers/addressDelete.controller";
import { customerDeletedList } from "../controllers/customerDeletedList.controller";
import { customerRestore } from "../controllers/customerRestore.controller";

const endpoints = [
  ["customer", customerDelete, softDeletes.customer],
  ["contact", contactDelete, softDeletes.contact],
  ["address", addressDelete, softDeletes.address],
] as const;

type Handler = (req: { id: string }) => Promise<{ ok: boolean }>;

describe("deleting customers, contacts and addresses", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(endpoints)("lets a superadmin hide a %s (soft delete in their own company)", async (_name, endpoint, softDelete) => {
    auth.role = "superadmin";
    await expect((endpoint as unknown as Handler)({ id: "x1" })).resolves.toEqual({ ok: true });
    expect(softDelete).toHaveBeenCalledWith("x1", "c1");
  });

  it.each(endpoints)("refuses everyone else to delete a %s", async (_name, endpoint, softDelete) => {
    for (const role of ["admin", "manager", "user"]) {
      auth.role = role;
      await expect((endpoint as unknown as Handler)({ id: "x1" })).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(softDelete).not.toHaveBeenCalled();
  });
});

describe("the deleted customers: list and restore", () => {
  beforeEach(() => vi.clearAllMocks());
  const list = customerDeletedList as unknown as () => Promise<unknown>;
  const restore = customerRestore as unknown as (req: { id: string }) => Promise<unknown>;

  it("are open to a superadmin, in their own company", async () => {
    auth.role = "superadmin";
    await expect(list()).resolves.toEqual({ data: [] });
    expect(deletedCustomers.listDeleted).toHaveBeenCalledWith("c1");
    await expect(restore({ id: "x1" })).resolves.toEqual({ customer: { id: "x1" } });
    expect(deletedCustomers.restore).toHaveBeenCalledWith("x1", "c1");
  });

  it("are closed to everyone else", async () => {
    for (const role of ["admin", "manager", "user"]) {
      auth.role = role;
      await expect(list()).rejects.toMatchObject({ code: "permission_denied" });
      await expect(restore({ id: "x1" })).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(deletedCustomers.listDeleted).not.toHaveBeenCalled();
    expect(deletedCustomers.restore).not.toHaveBeenCalled();
  });
});
