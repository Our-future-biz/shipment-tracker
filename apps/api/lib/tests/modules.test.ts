import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("./encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const h = vi.hoisted(() => ({
  authData: null as { userID: string; companyID: string; role: string } | null,
  lookup: vi.fn(async ({ companyId }: { companyId: string }) => ({ hiddenModules: companyId === "austromar" ? ["warehouse_concept", "trucking_concept"] : [] })),
}));
vi.mock("~encore/auth", () => ({ getAuthData: () => h.authData }));
vi.mock("~encore/clients", () => ({ auth: { _internalCompanyModules: h.lookup } }));

import { forgetHiddenModules, MODULE_HIDDEN, requireModule } from "../modules";

const as = (role: string, companyID: string) => (h.authData = { userID: "u1", companyID, role });

describe("requireModule", () => {
  beforeEach(() => {
    vi.useRealTimers();
    h.lookup.mockClear();
    forgetHiddenModules("austromar");
    forgetHiddenModules("demo");
  });

  it("refuses a user of a company that hides the module", async () => {
    as("admin", "austromar");
    await expect(requireModule("trucking_concept")).rejects.toMatchObject({ code: "permission_denied", message: MODULE_HIDDEN });
    await expect(requireModule("warehouse_concept")).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("lets a superadmin through without asking", async () => {
    as("superadmin", "austromar");
    await expect(requireModule("trucking_concept")).resolves.toBeUndefined();
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("lets a company that shows the module through", async () => {
    as("user", "demo");
    await expect(requireModule("trucking_concept")).resolves.toBeUndefined();
  });

  it("asks auth once a minute per company, and keeps the last answer when auth does not answer", async () => {
    vi.useFakeTimers();
    as("user", "demo");
    await requireModule("trucking_concept");
    await requireModule("warehouse_concept");
    expect(h.lookup).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    h.lookup.mockRejectedValueOnce(new Error("down"));
    await expect(requireModule("trucking_concept")).resolves.toBeUndefined();
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });

  it("refuses an unauthenticated call", async () => {
    h.authData = null;
    await expect(requireModule("trucking_concept")).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
