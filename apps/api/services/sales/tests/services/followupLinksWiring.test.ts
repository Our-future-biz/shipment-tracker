import { beforeEach, describe, expect, it, vi } from "vitest";

// Wiring: who may run the backfill, and which handler a customer change reaches. The Encore
// runtime isn't loaded under vitest: api() and Subscription hand back their handler.
const auth = vi.hoisted(() => ({ role: "superadmin" }));
vi.mock("encore.dev/api", () => ({
  api: (_opts: unknown, handler: unknown) => handler,
  APIError: {
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    unauthenticated: (msg: string) => new Error(msg),
  },
}));
vi.mock("encore.dev/pubsub", () => ({
  Topic: class {
    constructor(readonly name: string) {}
  },
  Subscription: class {
    constructor(
      readonly topic: { name: string },
      readonly name: string,
      readonly config: { handler: (event: unknown) => Promise<void> },
    ) {}
  },
}));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: auth.role }) }));
const service = vi.hoisted(() => ({
  normalize: vi.fn(async () => ({ checked: 0, changed: 0, unmatched: [] })),
  customerChanged: vi.fn(async () => 0),
}));
vi.mock("../../services/followupLinks.service", () => ({ followupLinksService: service }));

import { salesLinksNormalize } from "../../controllers/salesLinksNormalize.controller";
import { salesCustomerChanged } from "../../subscriptions/customerChanged.subscription";

const run = salesLinksNormalize as unknown as () => Promise<unknown>;

describe("sales links normalize", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is run by a superadmin, on their own company", async () => {
    auth.role = "superadmin";
    await expect(run()).resolves.toEqual({ checked: 0, changed: 0, unmatched: [] });
    expect(service.normalize).toHaveBeenCalledWith("c1");
  });

  it("is refused to everyone else", async () => {
    for (const role of ["admin", "manager", "user"]) {
      auth.role = role;
      await expect(run()).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(service.normalize).not.toHaveBeenCalled();
  });

  it("hands a customer change to the follow-up tasks", async () => {
    const sub = salesCustomerChanged as unknown as { topic: { name: string }; name: string; config: { handler: (event: unknown) => Promise<void> } };
    expect([sub.topic.name, sub.name]).toEqual(["customer-changed", "sales-customer-changed"]);
    const event = { companyId: "c1", customerId: "x", companyName: "A", label: "", deleted: false };
    await sub.config.handler(event);
    expect(service.customerChanged).toHaveBeenCalledWith(event);
  });
});
