import { beforeEach, describe, expect, it, vi } from "vitest";

// The internal endpoint the quotes service calls when it revises a quote. The Encore runtime isn't
// loaded under vitest: api() hands back the handler with the options it was declared with, and the
// caller's auth comes from a stubbed getAuthData.
const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const service = vi.hoisted(() => ({ moveQuote: vi.fn() }));
vi.mock("encore.dev/api", async () => ({
  ...(await import("../../../lib/tests/encoreApi.stub")),
  api: (options: unknown, handler: object) => Object.assign(handler, { options }),
}));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: USER, companyID: COMPANY, role: "user" }) }));
vi.mock("../services/loadingPlan.service", () => ({ loadingPlanService: service }));

import { _internalPlansMoveQuote } from "../controllers/_internalPlansMoveQuote.controller";

const endpoint = _internalPlansMoveQuote as unknown as ((req: Record<string, string>) => Promise<{ moved: number }>) & { options: Record<string, unknown> };

beforeEach(() => vi.clearAllMocks());

describe("_internalPlansMoveQuote", () => {
  it("is internal, takes the caller's auth, and lives under the service's own path", () => {
    expect(endpoint.options).toMatchObject({ expose: false, auth: true, method: "POST", path: "/internal/loading-planner/move-quote" });
  });

  it("moves the plans of the caller's company, as a save by the caller", async () => {
    service.moveQuote.mockResolvedValue(2);
    await expect(endpoint({ fromQuoteId: "q1", toQuoteId: "q2", toReference: "QCZ20261109001-R1" })).resolves.toEqual({ moved: 2 });
    expect(service.moveQuote).toHaveBeenCalledWith(COMPANY, USER, "q1", { id: "q2", reference: "QCZ20261109001-R1" });
  });
});
