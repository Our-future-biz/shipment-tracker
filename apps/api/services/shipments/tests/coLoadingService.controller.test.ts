import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest: api() hands back the handler, and the signed-in
// user comes from a stubbed getAuthData. The role check itself (lib/rbac requireRole) is the real one.
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const who = vi.hoisted(() => ({ role: "user" }));
const services = vi.hoisted(() => ({ money: vi.fn(), saveMoney: vi.fn(), list: vi.fn(), get: vi.fn(), settings: vi.fn() }));
const sailings = vi.hoisted(() => ({ trend: vi.fn(), setInlandWeight: vi.fn(), savePlanningPct: vi.fn() }));
vi.mock("encore.dev/api", async () => ({ ...(await import("../../../lib/tests/encoreApi.stub")), api: (_opts: unknown, handler: unknown) => handler }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: COMPANY, role: who.role }) }));
vi.mock("../services/coLoadingService.service", () => ({ coLoadingServiceService: services }));
vi.mock("../services/coLoadingSailing.service", () => ({ coLoadingSailingService: sailings }));

import * as controller from "../controllers/coLoadingService.controller";

// A service's money settings and its trend are for managers and admins (Council Outlay 14, B4, B5),
// as every figure of Earnings is; so are its inland weight and the company's planning share. The
// screen hides them from everyone else: these tests hold the server to refusing them.

type Handler = (req: Record<string, unknown>) => Promise<unknown>;
const call = (name: keyof typeof controller, req: Record<string, unknown> = {}) => (controller[name] as unknown as Handler)({ id: "s1", ...req });
const money = { defaultBoxCosts: [{ kind: "ocean", amount: 2100, currency: "USD", note: "" }], minEarningPerWm: 80 };

const MANAGERS_ONLY: [keyof typeof controller, () => ReturnType<typeof vi.fn>, Record<string, unknown>][] = [
  ["coLoadingServiceMoney", () => services.money, {}],
  ["coLoadingServiceMoneySet", () => services.saveMoney, money],
  ["coLoadingServiceTrend", () => sailings.trend, {}],
  ["coLoadingServiceInlandWeight", () => sailings.setInlandWeight, { inlandWeightKg: 18000 }],
  ["coLoadingSettingsSet", () => sailings.savePlanningPct, { planningVolumePct: 85 }],
];

describe("a service's money and trend, asked for over the API", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [endpoint, method, req] of MANAGERS_ONLY) {
    it(`${endpoint}: a plain user is refused, and nothing is read or written`, async () => {
      who.role = "user";
      await expect((async () => call(endpoint, req))()).rejects.toMatchObject({ code: "permission_denied" });
      expect(method()).not.toHaveBeenCalled();
    });

    it(`${endpoint}: a manager, an admin and a superadmin get through`, async () => {
      for (const role of ["manager", "admin", "superadmin"]) {
        who.role = role;
        await call(endpoint, req);
      }
      expect(method()).toHaveBeenCalledTimes(3);
    });
  }

  it("reads and writes them for the caller's own company only", async () => {
    who.role = "manager";
    await call("coLoadingServiceMoney");
    await call("coLoadingServiceMoneySet", money);
    await call("coLoadingServiceTrend");
    await call("coLoadingServiceInlandWeight", { inlandWeightKg: null });
    expect(services.money).toHaveBeenCalledWith("s1", COMPANY);
    expect(services.saveMoney).toHaveBeenCalledWith("s1", money, COMPANY);
    expect(sailings.trend).toHaveBeenCalledWith("s1", COMPANY);
    expect(sailings.setInlandWeight).toHaveBeenCalledWith("s1", null, COMPANY);
  });

  it("lets everyone read the settings, which carry no money", async () => {
    who.role = "user";
    await call("coLoadingSettingsGet");
    expect(services.settings).toHaveBeenCalledWith(COMPANY, "user");
  });
});
