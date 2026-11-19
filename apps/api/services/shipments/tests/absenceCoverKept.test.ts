import { beforeEach, describe, expect, it, vi } from "vitest";

// Pure: the run's repositories and the job's write are stand-ins, so only which jobs a run reads is checked.
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth: {}, shipments: {} }));
vi.mock("../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));
// Nobody of the company is a user any more: every cover whose absence auth no longer tells is a leaver's (P12).
vi.mock("../../../lib/companyUsers", () => ({ companyUsers: async () => [] }));
const { openRows, jobReads, closed, updates } = vi.hoisted(() => ({
  openRows: [] as Record<string, unknown>[],
  jobReads: [] as string[],
  closed: [] as string[],
  updates: [] as string[],
}));
vi.mock("../repositories/shipmentAbsenceCover.repository", () => ({
  shipmentAbsenceCoverRepository: {
    openOfCompany: async () => openRows,
    close: async (_c: string, id: string) => {
      closed.push(id);
      return true;
    },
    jobsToCover: async () => [],
  },
}));
// Every job still names the leaver in Handled By and is active: the leaver's cover stays (kept).
vi.mock("../repositories/shipment.repository", () => ({
  shipmentRepository: {
    getByIdForCompany: async (id: string) => {
      jobReads.push(id);
      return { id, holidayCover: "eva@firma.cz", personInCharge: "jan@firma.cz", status: "Booked", invoicingStatus: "" };
    },
  },
}));
vi.mock("../services/shipment.service", () => ({ shipmentService: { update: async (id: string) => void updates.push(id) } }));

import { absenceCoverService, KEPT_READS_PER_RUN, KEPT_RECHECK_MS, KeptCovers } from "../services/absenceCover.service";

const leaverRow = (n: number) => ({
  id: `row-${n}`,
  absenceId: `gone-${n}`,
  shipmentId: `job-${n}`,
  absentUserId: "u-jan",
  absentEmail: "jan@firma.cz",
  absentName: "Jan Novák",
  fromDate: "2026-11-16",
  toDate: "2026-11-20",
  coverEmail: "eva@firma.cz",
  setAt: new Date("2026-11-16T07:00:00Z"),
});
const actor = { companyID: "c-1", userID: "svc" };

describe("a leaver's covers kept on their jobs (P12)", () => {
  beforeEach(() => {
    openRows.length = 0;
    jobReads.length = 0;
    closed.length = 0;
    updates.length = 0;
  });

  it("are read once, then not again before a day has passed", async () => {
    openRows.push(leaverRow(1), leaverRow(2));
    const now = new Date("2026-11-21T08:00:00Z");
    expect(await absenceCoverService.applyForCompany(actor, [], now)).toMatchObject({ cleared: 0, left: 0, failed: 0 });
    expect(jobReads).toEqual(["job-1", "job-2"]);
    // The next runs of the day read none of them; nothing is cleared, closed or written.
    await absenceCoverService.applyForCompany(actor, [], new Date(now.getTime() + 15 * 60_000));
    await absenceCoverService.applyForCompany(actor, [], new Date(now.getTime() + KEPT_RECHECK_MS - 60_000));
    expect(jobReads).toEqual(["job-1", "job-2"]);
    expect([closed, updates]).toEqual([[], []]);
    // A day on, they are read again.
    await absenceCoverService.applyForCompany(actor, [], new Date(now.getTime() + KEPT_RECHECK_MS));
    expect(jobReads).toEqual(["job-1", "job-2", "job-1", "job-2"]);
  });

  it("are read at most KEPT_READS_PER_RUN in one run; the rest by the next run", async () => {
    for (let n = 0; n < KEPT_READS_PER_RUN + 5; n++) openRows.push(leaverRow(1000 + n));
    const now = new Date("2026-12-01T08:00:00Z");
    await absenceCoverService.applyForCompany(actor, [], now);
    expect(jobReads).toHaveLength(KEPT_READS_PER_RUN);
    await absenceCoverService.applyForCompany(actor, [], new Date(now.getTime() + 15 * 60_000));
    expect(jobReads).toHaveLength(KEPT_READS_PER_RUN + 5);
    expect(new Set(jobReads).size).toBe(KEPT_READS_PER_RUN + 5);
  });
});

describe("the list of kept covers", () => {
  it("skips a row read lately, forgets one that went, and holds nothing older than a day", () => {
    const kept = new KeptCovers();
    const now = new Date("2026-11-21T08:00:00Z");
    kept.kept("a", now);
    kept.kept("b", now);
    expect(kept.checkedLately("a", new Date(now.getTime() + 60_000))).toBe(true);
    expect(kept.checkedLately("c", now)).toBe(false);
    kept.forget("b");
    expect(kept.checkedLately("b", now)).toBe(false);
    expect(kept.checkedLately("a", new Date(now.getTime() + KEPT_RECHECK_MS))).toBe(false);
    kept.prune(new Date(now.getTime() + KEPT_RECHECK_MS));
    expect(kept.size).toBe(0);
  });
});
