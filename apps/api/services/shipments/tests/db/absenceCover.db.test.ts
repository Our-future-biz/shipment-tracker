import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";

// The company's users as the job's update checks a Holiday Cover against (requireUserEmail).
vi.mock("~encore/clients", () => ({
  auth: {
    usersList: async () => ({ users: [{ id: "00000000-0000-4000-8000-00000000a001", email: "jan@firma.cz", displayName: "Jan Novák" }, { id: "00000000-0000-4000-8000-00000000a002", email: "eva@firma.cz", displayName: "Eva Malá" }] }),
    userLookup: async ({ ids }: { ids: string[] }) => ({ users: ids.map((id) => ({ id, email: "svc@system.invalid", name: "Trucking (system)" })) }),
  },
  customers: {},
  invoicing: { openInvoiceCount: async () => ({ count: 0 }) },
  quotes: {},
  warehouse: { _internalPickupPlates: async () => ({ plates: [] }) },
  shipments: {},
}));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { db } from "../../db/db";
import { ABSENCE_COVER_FIELD, type CoverAbsence } from "../../lib/absenceCover";
import { CANCELLED_STATUS } from "../../lib/fieldDefaults";
import { shipmentAbsenceCoverRepository as covers } from "../../repositories/shipmentAbsenceCover.repository";
import { shipmentAbsenceCoverTable } from "../../schemas/shipmentAbsenceCover.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";
import { absenceCoverService } from "../../services/absenceCover.service";

// The SQL of the dated Holiday Cover (shipments migration 0088), against the shipments database: which
// jobs an absence's cover is set on, one open row per absence and job however many runs at once, and a
// whole run - set, then cleared once the absence is over, each with its lines in the job's history.
// Runs only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const SVC = randomUUID();
let jobs = 9300;
const newJob = async (companyId: string, over: Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">> = {}) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Export", freightMode: "Sea Freight", personInCharge: "jan@firma.cz", ...over }).returning();
  return row!;
};
const absence = (over: Partial<CoverAbsence> = {}): CoverAbsence => ({
  id: randomUUID(),
  userId: randomUUID(),
  userEmail: "jan@firma.cz",
  userName: "Jan Novák",
  fromDate: "2026-11-16",
  toDate: "2026-11-20",
  inForce: true,
  coverEmail: "eva@firma.cz",
  ...over,
});
// The cover's own lines: the job is written to the database bare here, so its first write through the app also
// fills the field defaults (each with its line) - not what this test is about.
const historyOf = async (shipmentId: string) =>
  (await db.select().from(shipmentAuditTable).where(eq(shipmentAuditTable.shipmentId, shipmentId)).orderBy(asc(shipmentAuditTable.changedAt))).filter(
    (h) => h.field === "holidayCover" || h.field === ABSENCE_COVER_FIELD,
  );

describe("the jobs an absence's cover is set on", () => {
  it("are the absent user's active jobs with no Holiday Cover, their Handled By read as the e-mail it names", async () => {
    const company = randomUUID();
    const plain = await newJob(company);
    const named = await newJob(company, { personInCharge: " Jan@Firma.cz — Jan Novák" });
    await newJob(company, { holidayCover: "eva@firma.cz" });
    await newJob(company, { personInCharge: "petr@firma.cz" });
    await newJob(company, { status: CANCELLED_STATUS });
    await newJob(company, { invoicingStatus: "Invoiced" });
    await newJob(company, { deletedAt: new Date() });
    await newJob(randomUUID());
    const of = { id: randomUUID(), coverEmail: "eva@firma.cz" };
    expect((await covers.jobsToCover(company, "jan@firma.cz", of, 50)).map((j) => j.id)).toEqual([plain.id, named.id]);
    expect(await covers.jobsToCover(company, "jan@firma.cz", of, 1)).toHaveLength(1);
  });

  it("leave out a job the absence set this cover on once, or whose row of it was closed, so they never keep the newer ones waiting", async () => {
    const company = randomUUID();
    const absenceId = randomUUID();
    const [setOnce, closed, pending, otherAbsence, otherCover, fresh] = [await newJob(company), await newJob(company), await newJob(company), await newJob(company), await newJob(company), await newJob(company)];
    const rowOf = (shipmentId: string, over: Partial<typeof shipmentAbsenceCoverTable.$inferInsert> = {}) => ({
      companyId: company,
      absenceId,
      shipmentId,
      absentUserId: randomUUID(),
      absentEmail: "jan@firma.cz",
      fromDate: "2026-11-16",
      toDate: "2026-11-20",
      coverEmail: "eva@firma.cz",
      ...over,
    });
    await db.insert(shipmentAbsenceCoverTable).values([
      // Set once, emptied by hand since: that stands.
      rowOf(setOnce.id, { setAt: new Date() }),
      rowOf(closed.id, { clearedAt: new Date(), outcome: "changed" }),
      // A write that failed: tried again.
      rowOf(pending.id),
      rowOf(otherAbsence.id, { absenceId: randomUUID(), setAt: new Date() }),
      // The absence named another cover before: the new one is set.
      rowOf(otherCover.id, { coverEmail: "petr@firma.cz", setAt: new Date(), clearedAt: new Date(), outcome: "cleared" }),
    ]);
    const ids = (await covers.jobsToCover(company, "jan@firma.cz", { id: absenceId, coverEmail: " Eva@Firma.cz" }, 3)).map((j) => j.id);
    expect(ids).toEqual([pending.id, otherAbsence.id, otherCover.id]);
    expect((await covers.jobsToCover(company, "jan@firma.cz", { id: absenceId, coverEmail: "eva@firma.cz" }, 50)).map((j) => j.id)).toEqual([pending.id, otherAbsence.id, otherCover.id, fresh.id]);
  });
});

describe("the rows of the covers set", () => {
  it("are one open row per absence and job, however many runs record it at once; a closed one makes room for the next", async () => {
    const company = randomUUID();
    const job = await newJob(company);
    const values = { companyId: company, absenceId: randomUUID(), shipmentId: job.id, absentUserId: randomUUID(), absentEmail: "jan@firma.cz", fromDate: "2026-11-16", toDate: "2026-11-20", coverEmail: "eva@firma.cz" };
    const [a, b] = await Promise.all([covers.ensureOpen(values), covers.ensureOpen(values)]);
    expect(a!.id).toBe(b!.id);
    expect(await covers.companiesWithOpen()).toContain(company);
    expect(await covers.close(company, a!.id, "cleared", new Date())).toBe(true);
    expect(await covers.close(company, a!.id, "changed", new Date())).toBe(false);
    const again = await covers.ensureOpen(values);
    expect(again!.id).not.toBe(a!.id);
    const rows = await db.select().from(shipmentAbsenceCoverTable).where(and(eq(shipmentAbsenceCoverTable.companyId, company)));
    expect(rows.map((r) => r.outcome).sort()).toEqual(["cleared", null].sort());
  });
});

describe("a run of the cover job", () => {
  it("sets the cover with its lines, once however often it runs, and clears it once the absence is over", async () => {
    const company = randomUUID();
    const job = await newJob(company);
    const away = absence();
    const actor = { companyID: company, userID: SVC };

    expect((await absenceCoverService.applyForCompany(actor, [away])).set).toBe(1);
    expect((await absenceCoverService.applyForCompany(actor, [away])).set).toBe(0);
    const [set] = await db.select().from(shipmentTable).where(eq(shipmentTable.id, job.id));
    expect(set!.holidayCover).toBe("eva@firma.cz");
    expect((await historyOf(job.id)).map((h) => [h.field, h.userId, h.newValue])).toEqual([
      ["holidayCover", SVC, "eva@firma.cz"],
      [ABSENCE_COVER_FIELD, SVC, "Holiday Cover eva@firma.cz while Jan Novák is away 16.11.–20.11."],
    ]);

    expect((await absenceCoverService.applyForCompany(actor, [{ ...away, inForce: false }])).cleared).toBe(1);
    const [cleared] = await db.select().from(shipmentTable).where(eq(shipmentTable.id, job.id));
    expect(cleared!.holidayCover).toBe("");
    expect((await historyOf(job.id)).at(-1)?.newValue).toBe("Holiday Cover eva@firma.cz cleared: Jan Novák is back");
    expect(await covers.openOfCompany(company)).toEqual([]);
  });

  it("closes a row whose write never went through without writing the job, though it holds the same e-mail - typed by hand", async () => {
    const company = randomUUID();
    const job = await newJob(company, { holidayCover: "eva@firma.cz" });
    const away = absence();
    await covers.ensureOpen({ companyId: company, absenceId: away.id, shipmentId: job.id, absentUserId: away.userId, absentEmail: "jan@firma.cz", fromDate: away.fromDate, toDate: away.toDate, coverEmail: "eva@firma.cz" });
    expect(await absenceCoverService.applyForCompany({ companyID: company, userID: SVC }, [])).toMatchObject({ cleared: 0, left: 1 });
    const [kept] = await db.select().from(shipmentTable).where(eq(shipmentTable.id, job.id));
    expect(kept!.holidayCover).toBe("eva@firma.cz");
    expect(await historyOf(job.id)).toEqual([]);
    const [closed] = await db.select().from(shipmentAbsenceCoverTable).where(eq(shipmentAbsenceCoverTable.shipmentId, job.id));
    expect(closed).toMatchObject({ outcome: "changed", setAt: null });
    expect(closed!.clearedAt).not.toBeNull();
  });

  it("leaves a cover somebody changed meanwhile as they made it", async () => {
    const company = randomUUID();
    const job = await newJob(company);
    const away = absence();
    const actor = { companyID: company, userID: SVC };
    await absenceCoverService.applyForCompany(actor, [away]);
    await db.update(shipmentTable).set({ holidayCover: "jan@firma.cz" }).where(eq(shipmentTable.id, job.id));
    expect(await absenceCoverService.applyForCompany(actor, [])).toMatchObject({ cleared: 0, left: 1 });
    const [kept] = await db.select().from(shipmentTable).where(eq(shipmentTable.id, job.id));
    expect(kept!.holidayCover).toBe("jan@firma.cz");
  });
});
