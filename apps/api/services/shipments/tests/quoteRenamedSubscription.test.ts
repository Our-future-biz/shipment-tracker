import { beforeEach, describe, expect, it, vi } from "vitest";

// Wiring of the quote-renamed subscription: what a rename event makes of the shipments that name
// the quote. The Encore runtime isn't loaded under vitest: Subscription hands back its handler.
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
  serviceActor: vi.fn(async (companyId: string) => ({ userID: "service-user", companyID: companyId, role: "user" })),
  followQuoteRename: vi.fn(async () => [] as string[]),
}));
vi.mock("../../../lib/quoteReferenceNow", () => ({ quoteReferenceNow: deps.referenceNow }));
vi.mock("../../../lib/outbox/serviceIdentity", () => ({ serviceActor: deps.serviceActor }));
vi.mock("../repositories/shipment.repository", () => ({ shipmentRepository: { followQuoteRename: deps.followQuoteRename } }));

import { shipmentsQuoteRenamed } from "../subscriptions/quoteRenamed.subscription";

const sub = shipmentsQuoteRenamed as unknown as { topic: { name: string }; name: string; config: { handler: (event: unknown) => Promise<void> } };
const EVENT = { companyId: "c1", from: "QCZ20261111002", to: "QCZROAD20261111002" };

beforeEach(() => vi.clearAllMocks());

describe("shipments-quote-renamed", () => {
  it("listens to quote-renamed", () => {
    expect([sub.topic.name, sub.name]).toEqual(["quote-renamed", "shipments-quote-renamed"]);
  });

  it("names the quote as Sales has it now on the shipments, with a history line written by the company's service identity", async () => {
    await sub.config.handler(EVENT);
    expect(deps.referenceNow).toHaveBeenCalledWith("c1", EVENT.from, EVENT.to);
    expect(deps.serviceActor).toHaveBeenCalledWith("c1");
    expect(deps.followQuoteRename).toHaveBeenCalledWith("c1", EVENT.from, EVENT.to, "service-user");
  });

  it("goes by the reference Sales has now, not by the event: a late event never sets an older one", async () => {
    deps.referenceNow.mockResolvedValueOnce("QCZAIR20261111002");
    await sub.config.handler(EVENT);
    expect(deps.followQuoteRename).toHaveBeenCalledWith("c1", EVENT.from, "QCZAIR20261111002", "service-user");
  });

  it("writes nothing when the service identity cannot be had: the event is delivered again", async () => {
    deps.serviceActor.mockRejectedValueOnce(new Error("auth is unreachable"));
    await expect(sub.config.handler(EVENT)).rejects.toThrow("auth is unreachable");
    expect(deps.followQuoteRename).not.toHaveBeenCalled();
  });
});
