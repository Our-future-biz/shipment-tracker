import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: { openInvoiceCount: async () => ({ count: 0 }) }, quotes: {}, warehouse: { _internalPickupPlates: async () => ({ plates: [] }) } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { db } from "../../db/db";
import { shipmentCustomerLinkTable } from "../../schemas/shipmentCustomerLink.schema";
import { shipmentTable } from "../../schemas/shipment.schema";
import { customerLinkService } from "../../services/customerLink.service";
import { claimService } from "../../services/claim.service";

// The customer's link and a claim's notice date against the shipments database, migration 0069
// included. Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
const NOW = new Date("2026-11-10T12:00:00Z");
let jobs = 200;

const newJob = async (over: object = {}) => {
  const companyId = randomUUID();
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", pol: "Shanghai", pod: "Hamburg", ...over }).returning();
  return { id: row!.id, companyId, actor: { userID: USER, companyID: companyId, role: "admin" } };
};
const tokenOf = (url: string) => url.split("/track/")[1]!;

describe("the customer's link", () => {
  it("opens the job's dates and stores only a hash", async () => {
    const s = await newJob({ estimatedArrival: "2026-11-20", freeComments: "margin is thin" });
    const { url, link } = await customerLinkService.create(s.id, s.actor, NOW);
    expect(link).toMatchObject({ open: true, openUntil: null, lastOpenedAt: null });
    const [row] = await db.select().from(shipmentCustomerLinkTable).where(eq(shipmentCustomerLinkTable.shipmentId, s.id));
    expect(row!.tokenHash).not.toBe(tokenOf(url));
    const status = await customerLinkService.publicStatus(tokenOf(url), NOW);
    expect(status).toMatchObject({ reference: expect.stringMatching(/^CZ/), pol: "Shanghai", pod: "Hamburg" });
    expect(status.milestones.find((m) => m.key === "arrived")).toMatchObject({ planned: "2026-11-20", actual: null });
    expect(JSON.stringify(status)).not.toContain("margin");
    expect((await customerLinkService.get(s.id, s.companyId, NOW))!.lastOpenedAt).not.toBeNull();
  });

  it("stops at once when stopped or replaced", async () => {
    const s = await newJob();
    const first = await customerLinkService.create(s.id, s.actor, NOW);
    const second = await customerLinkService.create(s.id, s.actor, NOW);
    await expect(customerLinkService.publicStatus(tokenOf(first.url), NOW)).rejects.toThrow("no longer valid");
    await expect(customerLinkService.publicStatus(tokenOf(second.url), NOW)).resolves.toBeDefined();
    await customerLinkService.revoke(s.id, s.actor);
    await expect(customerLinkService.publicStatus(tokenOf(second.url), NOW)).rejects.toThrow("no longer valid");
    await expect(customerLinkService.get(s.id, s.companyId, NOW)).resolves.toBeNull();
    await expect(customerLinkService.revoke(s.id, s.actor)).rejects.toThrow("no link");
  });

  it("closes 30 days after delivery and on a cancelled job, with the same answer", async () => {
    const s = await newJob();
    const { url } = await customerLinkService.create(s.id, s.actor, NOW);
    await db.update(shipmentTable).set({ actualDeliveryDate: "2026-11-01" }).where(eq(shipmentTable.id, s.id));
    await expect(customerLinkService.publicStatus(tokenOf(url), new Date("2026-12-01T12:00:00Z"))).resolves.toBeDefined();
    await expect(customerLinkService.publicStatus(tokenOf(url), new Date("2026-12-03T12:00:00Z"))).rejects.toThrow("no longer valid");
    await db.update(shipmentTable).set({ status: "Cancelled Shipment" }).where(eq(shipmentTable.id, s.id));
    await expect(customerLinkService.publicStatus(tokenOf(url), NOW)).rejects.toThrow("no longer valid");
    await expect(customerLinkService.create(s.id, s.actor, NOW)).rejects.toThrow("cancelled");
  });

  it("turns away a token it doesn't know", async () => {
    await expect(customerLinkService.publicStatus("a".repeat(43), NOW)).rejects.toThrow("no longer valid");
    await expect(customerLinkService.publicStatus("nonsense", NOW)).rejects.toThrow("no longer valid");
  });

  it("can't be made from another company", async () => {
    const s = await newJob();
    const other = await newJob();
    await expect(customerLinkService.create(s.id, other.actor, NOW)).rejects.toThrow("not found");
  });
});

describe("a claim's notice date", () => {
  it("is kept, and taken back with an empty value", async () => {
    const s = await newJob();
    const claim = await claimService.create(s.id, s.companyId, "cargo", { noticeDate: "2026-11-05" });
    expect(claim.noticeDate).toBe("2026-11-05");
    expect((await claimService.update(s.id, claim.id, s.companyId, { note: "wet" })).noticeDate).toBe("2026-11-05");
    expect((await claimService.update(s.id, claim.id, s.companyId, { noticeDate: "" })).noticeDate).toBeNull();
    await expect(claimService.update(s.id, claim.id, s.companyId, { noticeDate: "soon" })).rejects.toThrow("notice date");
  });
});
