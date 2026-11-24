import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest: api() hands back the handler, and the signed-in
// user comes from a stubbed getAuthData. The role check itself (lib/rbac requireRole) is the real one.
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const who = vi.hoisted(() => ({ role: "user" }));
const service = vi.hoisted(() => ({ earnings: vi.fn(), profits: vi.fn(), saveBoxCosts: vi.fn(), boxCostChanges: vi.fn(), utilization: vi.fn(), page: vi.fn(), list: vi.fn(), setDetails: vi.fn(), linkShipments: vi.fn() }));
vi.mock("encore.dev/api", async () => ({ ...(await import("../../../lib/tests/encoreApi.stub")), api: (_opts: unknown, handler: unknown) => handler }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: COMPANY, role: who.role }) }));
// The copy to shipments goes through the shipment service, which needs the database: a stand-in keeps this file to the controller.
vi.mock("../services/coLoadingCopy.service", () => ({ coLoadingCopyService: { facts: vi.fn(), copy: vi.fn() } }));
// The checklist, note and history read the database: a stand-in, as for the copy.
vi.mock("../services/coLoadingNotices.service", () => ({ coLoadingNoticesService: { list: vi.fn(), record: vi.fn() } }));
vi.mock("../services/coLoadingLog.service", () => ({ coLoadingLogService: { log: vi.fn(), setTick: vi.fn(), setNote: vi.fn() } }));
vi.mock("../services/coLoadingSailing.service", () => ({ coLoadingSailingService: service }));

import * as controller from "../controllers/coLoadingSailing.controller";

// Council Review 7, K18: Earnings is for managers and admins (Council Outlay 13, D14). The screen
// hides it from everyone else; these tests hold the server to refusing them, whatever the screen does.

type Handler = (req: Record<string, unknown>) => Promise<unknown>;
const call = (name: keyof typeof controller, req: Record<string, unknown> = {}) => (controller[name] as unknown as Handler)({ id: "s1", ...req });
const lines = [{ kind: "ocean", amount: 1000, currency: "EUR", note: "" }];

const MANAGERS_ONLY: [keyof typeof controller, keyof typeof service, Record<string, unknown>][] = [
  ["coLoadingSailingEarnings", "earnings", {}],
  ["coLoadingSailingProfits", "profits", {}],
  ["coLoadingSailingBoxCostsSave", "saveBoxCosts", { containerNo: 1, lines }],
  ["coLoadingSailingBoxCostChanges", "boxCostChanges", {}],
];

describe("a sailing's money, asked for over the API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.boxCostChanges.mockResolvedValue([]);
    service.profits.mockResolvedValue([]);
  });

  for (const [endpoint, method, req] of MANAGERS_ONLY) {
    it(`${endpoint}: a plain user is refused, and nothing is read or written`, async () => {
      who.role = "user";
      // The handler may refuse before it returns a promise: either way it must not go through.
      await expect((async () => call(endpoint, req))()).rejects.toMatchObject({ code: "permission_denied" });
      expect(service[method]).not.toHaveBeenCalled();
    });

    it(`${endpoint}: a manager, an admin and a superadmin get through`, async () => {
      for (const role of ["manager", "admin", "superadmin"]) {
        who.role = role;
        await call(endpoint, req);
      }
      expect(service[method]).toHaveBeenCalledTimes(3);
    });
  }

  it("reads the earnings and the profits for the caller's own company only", async () => {
    who.role = "manager";
    await call("coLoadingSailingEarnings");
    await call("coLoadingSailingProfits");
    expect(service.earnings).toHaveBeenCalledWith("s1", COMPANY);
    expect(service.profits).toHaveBeenCalledWith("s1", COMPANY);
  });

  it("saves box costs as the caller, with what the dialog showed", async () => {
    who.role = "manager";
    await call("coLoadingSailingBoxCostsSave", { containerNo: 1, lines, expected: lines });
    expect(service.saveBoxCosts).toHaveBeenCalledWith("s1", 1, lines, lines, expect.objectContaining({ userID: "u1", companyID: COMPANY, role: "manager" }));
  });

  it("lets everyone read what carries no money: the sailing, its list and its box utilization", async () => {
    who.role = "user";
    await call("coLoadingSailingGet");
    await call("coLoadingSailingList");
    await call("coLoadingSailingUtilization");
    expect(service.page).toHaveBeenCalledWith("s1", COMPANY);
    expect(service.list).toHaveBeenCalledWith("s1", COMPANY);
    expect(service.utilization).toHaveBeenCalledWith("s1", COMPANY);
  });

  it("hands the shipments to link on as sent: more than 200 are refused by the request's MaxLen, never cut short here", async () => {
    who.role = "user";
    const shipmentIds = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    await call("coLoadingSailingLinkShipments", { shipmentIds });
    expect(service.linkShipments).toHaveBeenCalledWith("s1", shipmentIds, expect.objectContaining({ companyID: COMPANY }), undefined);
  });

  it("hands \"Edit sailing\" on with the caller's role, which decides what they may change", async () => {
    who.role = "user";
    service.setDetails.mockResolvedValue({});
    await call("coLoadingSailingDetails", { containerCount: 1, cutoffDate: null });
    expect(service.setDetails).toHaveBeenCalledWith("s1", { containerCount: 1, cutoffDate: null }, expect.objectContaining({ role: "user", companyID: COMPANY }));
  });
});
