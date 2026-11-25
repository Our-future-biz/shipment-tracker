import { beforeEach, describe, expect, it, vi } from "vitest";

// The list of plans, all of the company's or one job's. The Encore runtime isn't loaded under
// vitest: api() hands back the handler, and the caller's auth comes from a stubbed getAuthData.
const COMPANY = "11111111-1111-4111-8111-111111111111";
const SAILING = "88888888-8888-4888-8888-888888888888";
const service = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("encore.dev/api", async () => ({ ...(await import("../../../lib/tests/encoreApi.stub")), api: (_options: unknown, handler: unknown) => handler }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: COMPANY, role: "user" }) }));
vi.mock("../services/loadingPlan.service", () => ({ loadingPlanService: service }));

import { loadingPlanList } from "../controllers/loadingPlanList.controller";

const list = loadingPlanList as unknown as (req: { linkKind?: string; linkId?: string }) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockResolvedValue({ plans: [], capped: false });
});

describe("loadingPlanList", () => {
  it("lists the plans of one sailing of the company (a box plan), as it does a shipment's or a quote's", async () => {
    await list({ linkKind: "sailing", linkId: SAILING });
    expect(service.list).toHaveBeenCalledWith(COMPANY, { kind: "sailing", id: SAILING });
    await list({ linkKind: "shipment", linkId: SAILING });
    expect(service.list).toHaveBeenLastCalledWith(COMPANY, { kind: "shipment", id: SAILING });
  });

  it("lists all of the company's plans without a link", async () => {
    await list({});
    expect(service.list).toHaveBeenCalledWith(COMPANY, undefined);
  });

  it("refuses a kind of job a plan cannot be linked to, naming the three it can", async () => {
    await expect(list({ linkKind: "invoice", linkId: SAILING })).rejects.toMatchObject({ code: "invalid_argument", message: "The kind of the linked job is shipment, quote or sailing" });
    expect(service.list).not.toHaveBeenCalled();
  });

  it("refuses a kind without an id, an id without a kind, and an id that is no id", async () => {
    await expect(list({ linkKind: "sailing" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(list({ linkId: SAILING })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(list({ linkKind: "sailing", linkId: "WEEK 51" })).rejects.toMatchObject({ code: "invalid_argument", message: "The id of the linked job is not valid" });
    expect(service.list).not.toHaveBeenCalled();
  });
});
