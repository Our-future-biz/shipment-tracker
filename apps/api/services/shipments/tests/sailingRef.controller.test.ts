import { beforeEach, describe, expect, it, vi } from "vitest";

// What the Loading Planner is told about a sailing a plan links to (_internalSailingRef). The Encore
// runtime isn't loaded under vitest: api() hands back the handler, and the caller comes from a stubbed getAuthData.
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SAILING = "22222222-2222-4222-8222-222222222222";
const service = vi.hoisted(() => ({ referenceOf: vi.fn(), planCargo: vi.fn() }));
vi.mock("encore.dev/api", async () => ({ ...(await import("../../../lib/tests/encoreApi.stub")), api: (_opts: unknown, handler: unknown) => handler }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: COMPANY, role: "user" }) }));
vi.mock("../services/coLoadingCopy.service", () => ({ coLoadingCopyService: {} }));
vi.mock("../services/coLoadingMasterJob.service", () => ({ coLoadingMasterJobService: {} }));
vi.mock("../services/coLoadingNotices.service", () => ({ coLoadingNoticesService: {} }));
vi.mock("../services/coLoadingLog.service", () => ({ coLoadingLogService: {} }));
vi.mock("../services/coLoadingSailing.service", () => ({ coLoadingSailingService: service }));

import { _internalSailingRef } from "../controllers/coLoadingSailing.controller";

const sailingRef = _internalSailingRef as unknown as (req: { sailingId: string; withCargo?: boolean }) => Promise<{ reference: string | null; cargo?: unknown }>;
const BOX = { sailingId: SAILING, serviceId: "s1", reference: "WEEK 51 · Import from Shanghai", containerType: "40' HC", containerCount: 1, shipments: [] };

beforeEach(() => {
  vi.clearAllMocks();
  service.referenceOf.mockResolvedValue("WEEK 51 · Import from Shanghai");
  service.planCargo.mockResolvedValue(BOX);
});

describe("_internalSailingRef", () => {
  it("answers what the company's sailing is called now, and reads no cargo unless asked", async () => {
    await expect(sailingRef({ sailingId: SAILING })).resolves.toEqual({ reference: "WEEK 51 · Import from Shanghai" });
    expect(service.referenceOf).toHaveBeenCalledWith(SAILING, COMPANY);
    expect(service.planCargo).not.toHaveBeenCalled();
  });

  it("asked with the cargo, gives the box's cargo as Plan this box takes it", async () => {
    await expect(sailingRef({ sailingId: SAILING, withCargo: true })).resolves.toEqual({ reference: "WEEK 51 · Import from Shanghai", cargo: BOX });
    expect(service.planCargo).toHaveBeenCalledWith(SAILING, COMPANY);
  });

  it("answers null, with no cargo, for a sailing the company does not have", async () => {
    service.referenceOf.mockResolvedValue(null);
    await expect(sailingRef({ sailingId: SAILING, withCargo: true })).resolves.toEqual({ reference: null });
    expect(service.planCargo).not.toHaveBeenCalled();
  });
});
