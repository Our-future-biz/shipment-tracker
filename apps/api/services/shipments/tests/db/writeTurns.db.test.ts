import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

// What two requests at the same moment leave behind, against the shipments database: each pair runs
// at once, and what is stored afterwards is what the write turns (and the conditional writes) let
// through. Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).
const openInvoiceCount = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: { openInvoiceCount }, quotes: {}, warehouse: { _internalPickupPlates: async () => ({ plates: [] }) } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { db } from "../../db/db";
import { containerRepository } from "../../repositories/container.repository";
import { shipmentTrackingEventRepository } from "../../repositories/shipmentTrackingEvent.repository";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentCustomerLinkTable } from "../../schemas/shipmentCustomerLink.schema";
import { shipmentTrackingEventTable } from "../../schemas/shipmentTrackingEvent.schema";
import { customerLinkService } from "../../services/customerLink.service";
import { shipmentService } from "../../services/shipment.service";
import { trackingService } from "../../services/tracking.service";

const USER = randomUUID();
const NOW = new Date("2026-11-10T12:00:00Z");
let jobs = 900;

const newShipment = async (over: object = {}) => {
  const companyId = randomUUID();
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZW${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", ...over })
    .returning();
  return { id: row!.id, companyId, actor: { userID: USER, companyID: companyId, role: "admin" } };
};
const live = (companyId: string) => db.select().from(shipmentTable).where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)));
const eventsOf = (shipmentId: string) => db.select().from(shipmentTrackingEventTable).where(and(eq(shipmentTrackingEventTable.shipmentId, shipmentId), isNull(shipmentTrackingEventTable.deletedAt)));
const container = { containerNumber: "MSKU1234567", sealNumber: "", type: "40HC", teu: "2", packages: "", packageType: "", grossWeight: "", volume: "" };

afterEach(() => {
  vi.restoreAllMocks();
  openInvoiceCount.mockReset();
  openInvoiceCount.mockImplementation(async () => ({ count: 0 }));
});

describe("a new shipment with its containers", () => {
  it("is stored with them or not at all: a container that can't be written leaves no shipment, and the next try makes one", async () => {
    const companyId = randomUUID();
    vi.spyOn(containerRepository, "syncForShipment").mockRejectedValueOnce(new Error("container write failed"));
    await expect(shipmentService.create(companyId, { tradeDirection: "Import", freightMode: "Sea Freight", containers: [container] } as never)).rejects.toThrow("container write failed");
    expect(await live(companyId)).toEqual([]);
    const { shipment } = await shipmentService.create(companyId, { tradeDirection: "Import", freightMode: "Sea Freight", containers: [container] } as never);
    expect(shipment.containers).toMatchObject([{ containerNumber: "MSKU1234567" }]);
    expect(await live(companyId)).toHaveLength(1);
  });
});

describe("two House BoL releases at once", () => {
  it("stamp the shipment once: the second is told it was already released", async () => {
    const s = await newShipment();
    const outcomes = await Promise.allSettled([
      shipmentService.releaseHouseBol(s.id, s.companyId, USER),
      shipmentService.releaseHouseBol(s.id, s.companyId, USER),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason.message)).toContain("already released");
    const released = outcomes.find((o) => o.status === "fulfilled") as PromiseFulfilledResult<{ houseBolRelease: string }>;
    const [row] = await live(s.companyId);
    expect(row!.houseBolRelease).toBe(released.value.houseBolRelease);
  });
});

describe("a delete while Invoicing numbers an invoice", () => {
  it("holds the shipment's write turn while it asks Invoicing: the reference waits, then finds the shipment gone", async () => {
    const s = await newShipment();
    let answer!: (value: { count: number }) => void;
    openInvoiceCount.mockImplementationOnce(
      () =>
        new Promise<{ count: number }>((resolve) => {
          answer = resolve;
        }),
    );
    const deleting = shipmentService.softDelete(s.id, s.companyId, USER, "admin");
    await vi.waitFor(() => expect(openInvoiceCount).toHaveBeenCalled());

    let finalized = false;
    const finalizing = shipmentService.finalizeReference(s.id, s.companyId).finally(() => (finalized = true));
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Invoicing's turn waits for the delete's.
    expect(finalized).toBe(false);
    answer({ count: 0 });
    await deleting;
    await expect(finalizing).rejects.toMatchObject({ message: "Shipment not found" });
    expect(await live(s.companyId)).toEqual([]);
  });
});

describe("a proposed date decided twice at once", () => {
  it("takes one decision; the other finds it decided", async () => {
    const s = await newShipment();
    const proposal = await shipmentTrackingEventRepository.add({
      companyId: s.companyId,
      shipmentId: s.id,
      kind: "arrived",
      occurredOn: "2026-11-05",
      source: "carrier",
      effect: "proposed",
      effectField: "actualArrival",
      effectValue: "2026-11-05",
    });
    const decide = (effect: "applied" | "dismissed") => shipmentTrackingEventRepository.decideProposal(proposal.id, s.companyId, { effect, decidedById: USER, decidedAt: new Date() });
    const [confirmed, dismissed] = await Promise.all([decide("applied"), decide("dismissed")]);
    expect([confirmed, dismissed].filter(Boolean)).toHaveLength(1);
    const [stored] = await eventsOf(s.id);
    expect(stored!.effect).toBe((confirmed ?? dismissed)!.effect);

    // A confirmation the shipment couldn't take is given back: only the one who made it, only while applied.
    if (stored!.effect === "applied") {
      await shipmentTrackingEventRepository.reopenProposal(proposal.id, s.companyId, randomUUID());
      expect((await eventsOf(s.id))[0]!.effect).toBe("applied");
      await shipmentTrackingEventRepository.reopenProposal(proposal.id, s.companyId, USER);
      expect((await eventsOf(s.id))[0]).toMatchObject({ effect: "proposed", decidedById: null, decidedAt: null });
    }
  });
});

describe("the same fact recorded twice at once (a double submit)", () => {
  it("is stored once, with its details", async () => {
    const s = await newShipment();
    const record = () => trackingService.record(s.id, s.actor, { kind: "arrived", occurredOn: "2026-11-05", place: "Charleston" }, NOW);
    const [first, second] = await Promise.all([record(), record()]);
    expect(first.id).toBe(second.id);
    expect(await eventsOf(s.id)).toMatchObject([{ kind: "arrived", occurredOn: "2026-11-05", place: "Charleston", effect: "applied" }]);
  });
});

describe("two customer links made at once", () => {
  it("both answer, and only the later one stays live", async () => {
    const s = await newShipment();
    const [a, b] = await Promise.all([customerLinkService.create(s.id, s.actor, NOW), customerLinkService.create(s.id, s.actor, NOW)]);
    expect(a.url).not.toBe(b.url);
    const links = await db
      .select()
      .from(shipmentCustomerLinkTable)
      .where(and(eq(shipmentCustomerLinkTable.shipmentId, s.id), isNull(shipmentCustomerLinkTable.revokedAt), isNull(shipmentCustomerLinkTable.deletedAt)));
    expect(links).toHaveLength(1);
  });
});
