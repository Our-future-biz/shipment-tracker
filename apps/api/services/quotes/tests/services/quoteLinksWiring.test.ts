import { beforeEach, describe, expect, it, vi } from "vitest";

// The endpoint and the subscriptions are wiring: who may run the backfill, and which handler an
// event of the Customer Database reaches. The Encore runtime isn't loaded under vitest: api() and
// Subscription hand back their handler, the signed-in user comes from a stubbed getAuthData.
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
  contactChanged: vi.fn(async () => 0),
}));
vi.mock("../../services/quoteLinks.service", () => ({ quoteLinksService: service }));

import { quoteLinksNormalize } from "../../controllers/quoteLinksNormalize.controller";
import { quotesContactChanged } from "../../subscriptions/contactChanged.subscription";
import { quotesCustomerChanged } from "../../subscriptions/customerChanged.subscription";

type Wired = { topic: { name: string }; name: string; config: { handler: (event: unknown) => Promise<void> } };
const run = quoteLinksNormalize as unknown as () => Promise<unknown>;

describe("quote links normalize", () => {
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
});

describe("subscriptions", () => {
  it("hand a customer change to the quotes", async () => {
    const sub = quotesCustomerChanged as unknown as Wired;
    expect([sub.topic.name, sub.name]).toEqual(["customer-changed", "quotes-customer-changed"]);
    const event = { companyId: "c1", customerId: "x", companyName: "A", label: "", deleted: false };
    await sub.config.handler(event);
    expect(service.customerChanged).toHaveBeenCalledWith(event);
  });

  it("hand a contact change to the quotes", async () => {
    const sub = quotesContactChanged as unknown as Wired;
    expect([sub.topic.name, sub.name]).toEqual(["contact-changed", "quotes-contact-changed"]);
    const event = { companyId: "c1", customerId: "x", contactId: "y", name: "", email: "", phone: "", deleted: true };
    await sub.config.handler(event);
    expect(service.contactChanged).toHaveBeenCalledWith(event);
  });
});
