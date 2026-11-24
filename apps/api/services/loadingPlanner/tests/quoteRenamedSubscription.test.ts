import { beforeEach, describe, expect, it, vi } from "vitest";

// Wiring of the quote-renamed subscription: what a rename event makes of the loading plans that
// name the quote. The Encore runtime isn't loaded under vitest: Subscription hands back its handler.
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
const deps = vi.hoisted(() => ({
  referenceNow: vi.fn(async (_companyId: string, _from: string, to: string) => to),
  followQuoteRename: vi.fn(async () => undefined),
}));
vi.mock("../../../lib/quoteReferenceNow", () => ({ quoteReferenceNow: deps.referenceNow }));
vi.mock("../services/loadingPlan.service", () => ({ loadingPlanService: { followQuoteRename: deps.followQuoteRename } }));

import { loadingPlannerQuoteRenamed } from "../subscriptions/quoteRenamed.subscription";

const sub = loadingPlannerQuoteRenamed as unknown as { topic: { name: string }; name: string; config: { handler: (event: unknown) => Promise<void> } };
const EVENT = { companyId: "c1", from: "QCZ20261111002", to: "QCZROAD20261111002" };

beforeEach(() => vi.clearAllMocks());

describe("loading-planner-quote-renamed", () => {
  it("listens to quote-renamed", () => {
    expect([sub.topic.name, sub.name]).toEqual(["quote-renamed", "loading-planner-quote-renamed"]);
  });

  it("names the quote on the company's plans as Sales has it now", async () => {
    await sub.config.handler(EVENT);
    expect(deps.referenceNow).toHaveBeenCalledWith("c1", EVENT.from, EVENT.to);
    expect(deps.followQuoteRename).toHaveBeenCalledWith("c1", EVENT.from, EVENT.to);
  });

  it("takes the reference Sales has now over the one an event delivered late carries", async () => {
    deps.referenceNow.mockResolvedValueOnce("QCZAIR20261111002");
    await sub.config.handler(EVENT);
    expect(deps.followQuoteRename).toHaveBeenCalledWith("c1", EVENT.from, "QCZAIR20261111002");
  });

  it("fails when Sales does not answer, so the event comes again, and rewrites nothing", async () => {
    deps.referenceNow.mockRejectedValueOnce(new Error("quotes unavailable"));
    await expect(sub.config.handler(EVENT)).rejects.toThrow("quotes unavailable");
    expect(deps.followQuoteRename).not.toHaveBeenCalled();
  });
});
