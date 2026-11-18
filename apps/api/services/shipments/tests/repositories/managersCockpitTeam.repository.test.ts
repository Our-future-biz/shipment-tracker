import { beforeEach, describe, expect, it, vi } from "vitest";

// What the new reads of Shipments → Managers' step 3 ask the database, statement by statement:
// the repositories run against a real drizzle over a stand-in for the Postgres client that keeps
// the SQL it is handed and answers with the rows a test gives it. What the statements find in
// real rows is tests/db/managersCockpitTeam.db.test.ts.
const fake = vi.hoisted(() => ({ queries: [] as { text: string; values: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("../../db/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const client = {
    query: async (config: { text: string; values?: unknown[] }, values?: unknown[]) => {
      fake.queries.push({ text: config.text, values: values ?? config.values ?? [] });
      return { rows: fake.rows, rowCount: fake.rows.length, fields: [] };
    },
  };
  return { db: drizzle(client as never) };
});

import { customsOfficeRequestRepository } from "../../repositories/customsOfficeRequest.repository";
import { documentChangeRequestRepository } from "../../repositories/documentChangeRequest.repository";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";
import { shipmentAuditRepository } from "../../repositories/shipmentAudit.repository";
import { shipmentCommentRepository } from "../../repositories/shipmentComment.repository";
import { shipmentNoteRepository } from "../../repositories/shipmentNote.repository";
import { shipmentReleaseOverrideRepository } from "../../repositories/shipmentReleaseOverride.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SINCE = new Date("2026-11-10T23:00:00Z");
const IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

beforeEach(() => {
  fake.queries.length = 0;
  fake.rows = [];
});

const USER = "33333333-3333-4333-8333-333333333333";
/** The one statement a read sent, on one line. */
const sent = () => {
  expect(fake.queries).toHaveLength(1);
  return fake.queries[0]!;
};

describe("when each job was last touched", () => {
  it("is one statement over the five tables, every arm bounded by the time - the two no index knows the time of also by the jobs", async () => {
    await shipmentAuditRepository.lastTouchedSince(COMPANY, IDS, SINCE);
    const { text, values } = sent();
    expect(text).toBe(
      'select "shipment_id", max("at") from ((((((' +
        'select "shipment_id", "changed_at" as "at" from "shipment_audit" where ("shipment_audit"."company_id" = $1 and "shipment_audit"."changed_at" >= $2)) union all (' +
        'select "shipment_id", "created_at" as "at" from "shipment_comment" where ("shipment_comment"."company_id" = $3 and "shipment_comment"."created_at" >= $4))) union all (' +
        'select "shipment_id", "created_at" as "at" from "shipment_note" where ("shipment_note"."company_id" = $5 and "shipment_note"."created_at" >= $6))) union all (' +
        'select "shipment_id", "done_at" as "at" from "shipment_note" where ("shipment_note"."company_id" = $7 and "shipment_note"."shipment_id" in ($8, $9) and "shipment_note"."done_at" >= $10))) union all (' +
        'select "shipment_id", "completed_at" as "at" from "shipment_task" where ("shipment_task"."company_id" = $11 and "shipment_task"."shipment_id" in ($12, $13) and "shipment_task"."completed_at" >= $14))) union all (' +
        'select "shipment_id", "created_at" as "at" from "shipment_tracking_event" where ("shipment_tracking_event"."company_id" = $15 and "shipment_tracking_event"."created_at" >= $16))) "touches" group by "touches"."shipment_id"',
    );
    const since = SINCE.toISOString();
    expect(values).toEqual([COMPANY, since, COMPANY, since, COMPANY, since, COMPANY, ...IDS, since, COMPANY, ...IDS, since, COMPANY, since]);
  });

  it("answers each job's newest touch as a moment, and sends nothing for no jobs", async () => {
    fake.rows = [[IDS[0], "2026-11-16 10:00:00.5+00"], [IDS[1], "2026-11-12 23:30:00+01"]];
    expect(await shipmentAuditRepository.lastTouchedSince(COMPANY, IDS, SINCE)).toEqual(
      new Map([
        [IDS[0], new Date("2026-11-16T10:00:00.500Z")],
        [IDS[1], new Date("2026-11-12T22:30:00.000Z")],
      ]),
    );
    fake.queries.length = 0;
    expect(await shipmentAuditRepository.lastTouchedSince(COMPANY, [], SINCE)).toEqual(new Map());
    expect(fake.queries).toHaveLength(0);
  });
});

describe("the changes the audit line asks about", () => {
  it("are the company's since then, of the fields asked for, the newest first, each with its job - a deleted one too", async () => {
    await shipmentAuditRepository.changesSince(COMPANY, SINCE, { fields: ["creditCheck", "deletedAt"], fieldPrefixes: ["task:"], turnedInto: [{ field: "status", value: "Cancelled Shipment" }] }, 5001);
    const { text, values } = sent();
    expect(text).toContain('from "shipment_audit" inner join "shipment" on ("shipment"."id" = "shipment_audit"."shipment_id" and "shipment"."company_id" = "shipment_audit"."company_id")');
    expect(text).toContain(
      'where ("shipment_audit"."company_id" = $1 and "shipment_audit"."changed_at" >= $2 and ("shipment_audit"."field" in ($3, $4) or "shipment_audit"."field" like $5 or ("shipment_audit"."field" = $6 and "shipment_audit"."new_value" = $7)))' +
        ' order by "shipment_audit"."changed_at" desc, "shipment_audit"."id" desc limit $8',
    );
    // Nothing leaves out a job that is deleted: its deletion is one of the changes.
    expect(text).not.toContain("deleted_at");
    expect(values).toEqual([COMPANY, SINCE.toISOString(), "creditCheck", "deletedAt", "task:%", "status", "Cancelled Shipment", 5001]);
  });

  it("asks only for what is wanted, and sends nothing when nothing is", async () => {
    await shipmentAuditRepository.changesSince(COMPANY, SINCE, { fields: [], fieldPrefixes: [], turnedInto: [{ field: "status", value: "Cancelled Shipment" }] }, 10);
    expect(sent().text).toContain('"shipment_audit"."changed_at" >= $2 and ("shipment_audit"."field" = $3 and "shipment_audit"."new_value" = $4)) order by');
    fake.queries.length = 0;
    expect(await shipmentAuditRepository.changesSince(COMPANY, SINCE, { fields: [], fieldPrefixes: [], turnedInto: [] }, 10)).toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });

  it("answers the change with its job's number and Handled By", async () => {
    fake.rows = [[IDS[0], "CZ00000001", "jan@firma.cz", USER, "creditCheck", "Red", "Green", "2026-11-16 10:00:00+00"]];
    expect(await shipmentAuditRepository.changesSince(COMPANY, SINCE, { fields: ["creditCheck"], fieldPrefixes: [], turnedInto: [] }, 10)).toEqual([
      { shipmentId: IDS[0], jobNumber: "CZ00000001", personInCharge: "jan@firma.cz", userId: USER, field: "creditCheck", oldValue: "Red", newValue: "Green", changedAt: new Date("2026-11-16T10:00:00Z") },
    ]);
  });
});

describe("the to-dos past their day", () => {
  it("are the jobs' open, live to-dos due before today", async () => {
    fake.rows = [[IDS[0], "Call the carrier", "2026-11-16"]];
    expect(await shipmentNoteRepository.lateByShipmentIds(IDS, COMPANY, "2026-11-18")).toEqual([{ shipmentId: IDS[0], text: "Call the carrier", dueDate: "2026-11-16" }]);
    const { text, values } = sent();
    expect(text).toBe(
      'select "shipment_id", "text", "due_date" from "shipment_note" where ("shipment_note"."company_id" = $1 and "shipment_note"."shipment_id" in ($2, $3) and "shipment_note"."due_date" < $4 and "shipment_note"."done_at" is null and "shipment_note"."deleted_at" is null)',
    );
    expect(values).toEqual([COMPANY, ...IDS, "2026-11-18"]);
    fake.queries.length = 0;
    expect(await shipmentNoteRepository.lateByShipmentIds([], COMPANY, "2026-11-18")).toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });
});

describe("the @mentions not read", () => {
  it("are the jobs' live chat lines not crossed out, one row per user tagged, kept when that user has no read mark after the line - and is not its writer", async () => {
    fake.rows = [[IDS[0], USER, "2026-11-16 09:12:00+01"]];
    expect(await shipmentCommentRepository.unreadMentionsByShipmentIds(IDS, COMPANY, [USER])).toEqual([{ shipmentId: IDS[0], userId: USER, createdAt: new Date("2026-11-16T08:12:00Z") }]);
    const { text, values } = sent();
    expect(text).toBe(
      'select "tagged"."shipment_id", "tagged_user_id", "tagged"."created_at" from (' +
        'select "shipment_id", "created_at", "author_id", unnest("mentioned_user_ids") as "tagged_user_id" from "shipment_comment"' +
        ' where ("shipment_comment"."company_id" = $1 and "shipment_comment"."shipment_id" in ($2, $3) and "shipment_comment"."deleted_at" is null and "shipment_comment"."struck_at" is null and cardinality("shipment_comment"."mentioned_user_ids") > 0)) "tagged"' +
        ' left join "shipment_comment_read" on ("shipment_comment_read"."company_id" = $4 and "shipment_comment_read"."shipment_id" = "tagged"."shipment_id" and "shipment_comment_read"."user_id" = "tagged_user_id")' +
        ' where ("tagged_user_id" in ($5) and "tagged"."author_id" <> "tagged_user_id" and ("shipment_comment_read"."read_at" is null or "tagged"."created_at" > "shipment_comment_read"."read_at"))',
    );
    expect(values).toEqual([COMPANY, ...IDS, COMPANY, USER]);
  });

  it("sends nothing for no jobs, and for nobody to ask about", async () => {
    expect(await shipmentCommentRepository.unreadMentionsByShipmentIds([], COMPANY, [USER])).toEqual([]);
    expect(await shipmentCommentRepository.unreadMentionsByShipmentIds(IDS, COMPANY, [])).toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });
});

describe("the audit line's other tables", () => {
  it("reads the releases of unpaid prepayment jobs by the company and the time, the newest first", async () => {
    await shipmentReleaseOverrideRepository.listSince(COMPANY, SINCE, 5001);
    const { text, values } = sent();
    expect(text).toContain('where ("shipment_release_override"."company_id" = $1 and "shipment_release_override"."created_at" >= $2) order by "shipment_release_override"."created_at" desc limit $3');
    expect(values).toEqual([COMPANY, SINCE.toISOString(), 5001]);
  });

  it("reads the live documents approved for customs by their own uploader since then, and answers only whole rows", async () => {
    fake.rows = [
      [IDS[0], "CZ00000001", "invoice.pdf", "Invoice", USER, "2026-11-16 10:00:00+00"],
      [IDS[1], "CZ00000002", "broken.pdf", "Invoice", null, null],
    ];
    expect(await shipmentAttachmentRepository.ownApprovalsSince(COMPANY, SINCE, 5001)).toEqual([
      { shipmentId: IDS[0], jobNumber: "CZ00000001", fileName: "invoice.pdf", documentType: "Invoice", reviewedById: USER, reviewedAt: new Date("2026-11-16T10:00:00Z") },
    ]);
    const { text, values } = sent();
    expect(text).toContain(
      // "approved" stands in the statement itself: the index of the approved documents is then seen to fit.
      'where ("shipment_attachment"."company_id" = $1 and "shipment_attachment"."customs_status" = \'approved\' and "shipment_attachment"."customs_reviewed_at" >= $2 and "shipment_attachment"."customs_reviewed_by_id" = "shipment_attachment"."uploaded_by_id" and "shipment_attachment"."deleted_at" is null)' +
        ' order by "shipment_attachment"."customs_reviewed_at" desc limit $3',
    );
    expect(values).toEqual([COMPANY, SINCE.toISOString(), 5001]);
  });

  it("reads the requests answered since then from each of the two tables, a deleted job's too", async () => {
    await customsOfficeRequestRepository.decidedSince(COMPANY, SINCE, 5001);
    const office = sent();
    expect(office.text).toContain(
      'where ("customs_office_request"."company_id" = $1 and "customs_office_request"."deleted_at" is null and "customs_office_request"."status" <> $2 and "customs_office_request"."decided_at" >= $3) order by "customs_office_request"."decided_at" desc limit $4',
    );
    expect(office.values).toEqual([COMPANY, "pending", SINCE.toISOString(), 5001]);
    fake.queries.length = 0;
    await documentChangeRequestRepository.decidedSince(COMPANY, SINCE, 5001);
    const document = sent();
    expect(document.text).toContain(
      'where ("document_change_request"."company_id" = $1 and "document_change_request"."deleted_at" is null and "document_change_request"."status" <> $2 and "document_change_request"."decided_at" >= $3) order by "document_change_request"."decided_at" desc limit $4',
    );
    // The shipment is joined for its number, not asked whether it is deleted.
    for (const text of [office.text, document.text]) expect(text).not.toContain('"shipment"."deleted_at"');
  });
});
