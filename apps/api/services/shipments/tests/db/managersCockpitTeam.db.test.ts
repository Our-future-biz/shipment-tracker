import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { businessInstant } from "../../../../lib/businessDate";
import { db } from "../../db/db";
import { customsOfficeRequestRepository } from "../../repositories/customsOfficeRequest.repository";
import { documentChangeRequestRepository } from "../../repositories/documentChangeRequest.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";
import { shipmentAuditRepository } from "../../repositories/shipmentAudit.repository";
import { shipmentCommentRepository } from "../../repositories/shipmentComment.repository";
import { shipmentNoteRepository } from "../../repositories/shipmentNote.repository";
import { shipmentReleaseOverrideRepository } from "../../repositories/shipmentReleaseOverride.repository";
import { customsOfficeRequestTable } from "../../schemas/customsOfficeRequest.schema";
import { documentChangeRequestTable } from "../../schemas/documentChangeRequest.schema";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";
import { shipmentAttachmentTable, type NewShipmentAttachmentRecord } from "../../schemas/shipmentAttachment.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentCommentTable } from "../../schemas/shipmentComment.schema";
import { shipmentCommentReadTable } from "../../schemas/shipmentCommentRead.schema";
import { shipmentNoteTable } from "../../schemas/shipmentNote.schema";
import { shipmentReleaseOverrideTable } from "../../schemas/shipmentReleaseOverride.schema";
import { shipmentTaskTable } from "../../schemas/shipmentTask.schema";
import { shipmentTrackingEventTable } from "../../schemas/shipmentTrackingEvent.schema";

// The reads behind Shipments → Managers' step 3 - the people around the jobs and the audit line -
// against the shipments database: each new repository method finds the rows of the company (and
// the jobs or the days asked about) and nothing else. What each asks the database, statement by
// statement, is tests/repositories/managersCockpitTeam.repository.test.ts. Runs only under
// `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
const OTHER_USER = randomUUID();
let jobs = 7600;
// Wednesday 18 Nov 2026; Tuesday the 17th is a public holiday.
const at = (wall: string) => businessInstant(wall.slice(0, 10), wall.slice(11));
// The first minute of Wednesday the 11th: what a touch has to be at or after to count for five working days.
const SINCE = at("2026-11-11 00:00");

const newJob = async (companyId: string, over: Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">> = {}) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", ...over }).returning();
  return row!;
};
const newChange = (companyId: string, shipmentId: string, field: string, wall: string, over: Partial<typeof shipmentAuditTable.$inferInsert> = {}) =>
  db.insert(shipmentAuditTable).values({ companyId, shipmentId, userId: USER, field, changedAt: at(wall), ...over });
const newLine = async (companyId: string, shipmentId: string, wall: string, over: Partial<typeof shipmentCommentTable.$inferInsert> = {}) => {
  const [row] = await db.insert(shipmentCommentTable).values({ companyId, shipmentId, authorId: OTHER_USER, message: "Please look", createdAt: at(wall), ...over }).returning();
  return row!;
};
const newTodo = (companyId: string, shipmentId: string, over: Partial<typeof shipmentNoteTable.$inferInsert> = {}) =>
  db.insert(shipmentNoteTable).values({ companyId, shipmentId, text: "Call the carrier", authorId: USER, createdAt: at("2026-10-01 09:00"), ...over });
const newFile = async (companyId: string, shipmentId: string, over: Partial<NewShipmentAttachmentRecord> = {}) => {
  const [row] = await db.insert(shipmentAttachmentTable).values({ companyId, shipmentId, fileName: "file.pdf", documentType: "Invoice", ...over }).returning();
  return row!;
};

describe("when each job was last touched", () => {
  it("is the newest of its history, chat, to-dos written or ticked, tasks ticked and tracking events since then - an older touch is none", async () => {
    const companyId = randomUUID();
    const [byHistory, byChat, byTodo, byTick, byTask, byEvent, old, several] = await Promise.all(Array.from({ length: 8 }, () => newJob(companyId)));
    await newChange(companyId, byHistory!.id, "status", "2026-11-12 10:00");
    await newLine(companyId, byChat!.id, "2026-11-13 09:00");
    await newTodo(companyId, byTodo!.id, { createdAt: at("2026-11-16 08:00") });
    // Written long ago, ticked off on Monday.
    await newTodo(companyId, byTick!.id, { doneAt: at("2026-11-16 15:00"), doneById: USER });
    await db.insert(shipmentTaskTable).values({ companyId, shipmentId: byTask!.id, taskKey: "booking_confirmed", completed: true, completedAt: at("2026-11-11 00:00"), completedById: USER, createdAt: at("2026-10-01 09:00") });
    await db.insert(shipmentTrackingEventTable).values({ companyId, shipmentId: byEvent!.id, kind: "gate_in", occurredOn: "2026-11-01", createdAt: at("2026-11-18 08:00") });
    // Everything on this one is from before the window - by a minute, at the latest.
    await newChange(companyId, old!.id, "status", "2026-11-10 23:59");
    await newLine(companyId, old!.id, "2026-11-02 09:00");
    await newTodo(companyId, old!.id, { doneAt: at("2026-11-05 15:00") });
    // The newest of several wins.
    await newChange(companyId, several!.id, "status", "2026-11-12 10:00");
    await newLine(companyId, several!.id, "2026-11-17 18:30");
    await newChange(companyId, several!.id, "eta", "2026-11-14 10:00");

    const ids = [byHistory, byChat, byTodo, byTick, byTask, byEvent, old, several].map((j) => j!.id);
    const touched = await shipmentAuditRepository.lastTouchedSince(companyId, ids, SINCE);
    expect(touched.get(byHistory!.id)).toEqual(at("2026-11-12 10:00"));
    expect(touched.get(byChat!.id)).toEqual(at("2026-11-13 09:00"));
    expect(touched.get(byTodo!.id)).toEqual(at("2026-11-16 08:00"));
    expect(touched.get(byTick!.id)).toEqual(at("2026-11-16 15:00"));
    expect(touched.get(byTask!.id)).toEqual(at("2026-11-11 00:00"));
    expect(touched.get(byEvent!.id)).toEqual(at("2026-11-18 08:00"));
    expect(touched.get(several!.id)).toEqual(at("2026-11-17 18:30"));
    expect(touched.has(old!.id)).toBe(false);
  });

  it("is the company's own: another company's rows touch nothing, and no jobs is no statement", async () => {
    const companyId = randomUUID();
    const otherCompany = randomUUID();
    const mine = await newJob(companyId);
    const theirs = await newJob(otherCompany);
    await newChange(otherCompany, theirs.id, "status", "2026-11-16 10:00");
    await newTodo(otherCompany, theirs.id, { doneAt: at("2026-11-16 15:00") });
    expect(await shipmentAuditRepository.lastTouchedSince(companyId, [mine.id, theirs.id], SINCE)).toEqual(new Map());
    expect(await shipmentAuditRepository.lastTouchedSince(companyId, [], SINCE)).toEqual(new Map());
  });

  it("asks about a ticked to-do or task only on the jobs handed in - the other tables answer for whatever job the company touched", async () => {
    const companyId = randomUUID();
    const asked = await newJob(companyId);
    const notAsked = await newJob(companyId);
    await newTodo(companyId, notAsked.id, { doneAt: at("2026-11-16 15:00") });
    const touched = await shipmentAuditRepository.lastTouchedSince(companyId, [asked.id], SINCE);
    expect(touched.has(notAsked.id)).toBe(false);
    // A chat line on a job not handed in is among the rows: the caller keeps its own jobs.
    await newLine(companyId, notAsked.id, "2026-11-13 09:00");
    expect((await shipmentAuditRepository.lastTouchedSince(companyId, [asked.id], SINCE)).get(notAsked.id)).toEqual(at("2026-11-13 09:00"));
  });
});

describe("the to-dos past their day", () => {
  it("are the jobs' open, live to-dos due before today", async () => {
    const companyId = randomUUID();
    const a = await newJob(companyId);
    const notAsked = await newJob(companyId);
    await newTodo(companyId, a.id, { text: "Late", dueDate: "2026-11-17" });
    await newTodo(companyId, a.id, { text: "Due today", dueDate: "2026-11-18" });
    await newTodo(companyId, a.id, { text: "No day" });
    await newTodo(companyId, a.id, { text: "Done", dueDate: "2026-11-10", doneAt: new Date() });
    await newTodo(companyId, a.id, { text: "Deleted", dueDate: "2026-11-10", deletedAt: new Date() });
    await newTodo(companyId, notAsked.id, { text: "Somebody else's", dueDate: "2026-11-10" });
    expect(await shipmentNoteRepository.lateByShipmentIds([a.id], companyId, "2026-11-18")).toEqual([{ shipmentId: a.id, text: "Late", dueDate: "2026-11-17" }]);
    expect(await shipmentNoteRepository.lateByShipmentIds([a.id], randomUUID(), "2026-11-18")).toEqual([]);
    expect(await shipmentNoteRepository.lateByShipmentIds([], companyId, "2026-11-18")).toEqual([]);
  });
});

describe("the @mentions not read", () => {
  it("are the lines tagging one of the users asked about who has not opened the chat since - one row per line and user", async () => {
    const companyId = randomUUID();
    const jan = randomUUID();
    const eva = randomUUID();
    const petr = randomUUID();
    const a = await newJob(companyId);
    const b = await newJob(companyId);
    const notAsked = await newJob(companyId);
    // Jan opened a's chat on Friday noon: the line before it is read, the ones after are not. Eva never opened it.
    await db.insert(shipmentCommentReadTable).values({ companyId, shipmentId: a.id, userId: jan, readAt: at("2026-11-13 12:00") });
    await newLine(companyId, a.id, "2026-11-13 09:00", { mentionedUserIds: [jan, eva] });
    await newLine(companyId, a.id, "2026-11-16 09:12", { mentionedUserIds: [jan] });
    await newLine(companyId, a.id, "2026-11-16 10:00", { mentionedUserIds: [petr] });
    await newLine(companyId, a.id, "2026-11-16 11:00");
    await newLine(companyId, a.id, "2026-11-16 12:00", { mentionedUserIds: [jan], deletedAt: new Date() });
    // Crossed out by its writer: it asks nothing any more.
    await newLine(companyId, a.id, "2026-11-16 12:30", { mentionedUserIds: [jan, eva], struckAt: new Date() });
    // What Jan wrote himself, tagging himself: nobody waits for him to read it.
    await newLine(companyId, a.id, "2026-11-16 13:00", { authorId: jan, mentionedUserIds: [jan, eva] });
    // Jan's read mark of a counts for a only.
    await newLine(companyId, b.id, "2026-11-12 08:00", { mentionedUserIds: [jan] });
    await newLine(companyId, notAsked.id, "2026-11-12 08:00", { mentionedUserIds: [jan] });

    const rows = await shipmentCommentRepository.unreadMentionsByShipmentIds([a.id, b.id], companyId, [jan, eva]);
    const shown = rows.map((r) => `${r.shipmentId === a.id ? "a" : "b"} ${r.userId === jan ? "jan" : "eva"} ${r.createdAt.toISOString()}`).sort();
    expect(shown).toEqual(
      [`a eva ${at("2026-11-13 09:00").toISOString()}`, `a eva ${at("2026-11-16 13:00").toISOString()}`, `a jan ${at("2026-11-16 09:12").toISOString()}`, `b jan ${at("2026-11-12 08:00").toISOString()}`].sort(),
    );
    expect(await shipmentCommentRepository.unreadMentionsByShipmentIds([a.id, b.id], randomUUID(), [jan, eva])).toEqual([]);
    expect(await shipmentCommentRepository.unreadMentionsByShipmentIds([a.id, b.id], companyId, [])).toEqual([]);
    expect(await shipmentCommentRepository.unreadMentionsByShipmentIds([], companyId, [jan])).toEqual([]);
  });
});

describe("the changes the audit line asks about", () => {
  it("are the company's since then, of the fields asked for, the newest first, with the job's number and Handled By - a deleted job's too", async () => {
    const companyId = randomUUID();
    const live = await newJob(companyId, { personInCharge: "jan@firma.cz" });
    const gone = await newJob(companyId, { personInCharge: "eva@firma.cz", deletedAt: new Date() });
    await newChange(companyId, live.id, "creditCheck", "2026-11-12 10:00", { oldValue: "Red", newValue: "Green" });
    await newChange(companyId, live.id, "status", "2026-11-13 10:00", { oldValue: "Booked [IMP]", newValue: "Arrived [IMP]" });
    await newChange(companyId, live.id, "status", "2026-11-14 10:00", { oldValue: "Arrived [IMP]", newValue: "Cancelled Shipment" });
    await newChange(companyId, live.id, "task:customs_cleared", "2026-11-15 10:00", { oldValue: "ticked", newValue: "taken back: wrong job" });
    await newChange(companyId, live.id, "estimatedArrival", "2026-11-15 11:00", { oldValue: "2026-11-10", newValue: "2026-11-12" });
    await newChange(companyId, live.id, "creditCheck", "2026-11-10 10:00", { oldValue: "Red", newValue: "Green" });
    await newChange(companyId, gone.id, "deletedAt", "2026-11-16 10:00", { newValue: "2026-11-16T09:00:00.000Z" });
    const otherCompany = randomUUID();
    const theirs = await newJob(otherCompany);
    await newChange(otherCompany, theirs.id, "deletedAt", "2026-11-16 10:00", { newValue: "x" });

    const ask = { fields: ["creditCheck", "deletedAt"], fieldPrefixes: ["task:"], turnedInto: [{ field: "status", value: "Cancelled Shipment" }] };
    const rows = await shipmentAuditRepository.changesSince(companyId, SINCE, ask, 100);
    expect(rows.map((r) => [r.jobNumber, r.personInCharge, r.field, r.newValue])).toEqual([
      [gone.jobNumber, "eva@firma.cz", "deletedAt", "2026-11-16T09:00:00.000Z"],
      [live.jobNumber, "jan@firma.cz", "task:customs_cleared", "taken back: wrong job"],
      [live.jobNumber, "jan@firma.cz", "status", "Cancelled Shipment"],
      [live.jobNumber, "jan@firma.cz", "creditCheck", "Green"],
    ]);
    expect(rows[0]).toMatchObject({ shipmentId: gone.id, userId: USER, oldValue: null, changedAt: at("2026-11-16 10:00") });
    expect((await shipmentAuditRepository.changesSince(companyId, SINCE, ask, 2)).map((r) => r.field)).toEqual(["deletedAt", "task:customs_cleared"]);
    expect(await shipmentAuditRepository.changesSince(companyId, SINCE, { fields: [], fieldPrefixes: [], turnedInto: [] }, 100)).toEqual([]);
  });
});

describe("the audit line's other tables", () => {
  it("finds the releases of unpaid prepayment jobs since then, the newest first, with the job's number", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const release = (wall: string, over: Partial<typeof shipmentReleaseOverrideTable.$inferInsert> = {}) =>
      db.insert(shipmentReleaseOverrideTable).values({ companyId, shipmentId: job.id, kind: "house_bol", reason: "Pays on Friday", checked: true, byUserId: USER, by: "boss@firma.cz", createdAt: at(wall), ...over });
    await release("2026-11-12 10:00");
    await release("2026-11-16 10:00", { kind: "warehouse_released", checked: false });
    await release("2026-11-10 10:00");
    const rows = await shipmentReleaseOverrideRepository.listSince(companyId, SINCE, 100);
    expect(rows).toEqual([
      { shipmentId: job.id, jobNumber: job.jobNumber, kind: "warehouse_released", reason: "Pays on Friday", checked: false, by: "boss@firma.cz", createdAt: at("2026-11-16 10:00") },
      { shipmentId: job.id, jobNumber: job.jobNumber, kind: "house_bol", reason: "Pays on Friday", checked: true, by: "boss@firma.cz", createdAt: at("2026-11-12 10:00") },
    ]);
    expect(await shipmentReleaseOverrideRepository.listSince(randomUUID(), SINCE, 100)).toEqual([]);
    expect(await shipmentReleaseOverrideRepository.listSince(companyId, SINCE, 1)).toHaveLength(1);
  });

  it("finds the live documents approved for customs since then by the very user who uploaded them", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const approved = { customsStatus: "approved" as const, customsReviewedAt: at("2026-11-16 10:00"), customsReviewedById: USER };
    const own = await newFile(companyId, job.id, { ...approved, uploadedById: USER, fileName: "own.pdf" });
    await newFile(companyId, job.id, { ...approved, uploadedById: OTHER_USER, fileName: "a-colleague's.pdf" });
    await newFile(companyId, job.id, { ...approved, uploadedById: null, fileName: "nobody-knows-whose.pdf" });
    await newFile(companyId, job.id, { ...approved, uploadedById: USER, customsReviewedAt: at("2026-11-10 10:00"), fileName: "too-old.pdf" });
    await newFile(companyId, job.id, { ...approved, uploadedById: USER, customsStatus: "declined", fileName: "declined.pdf" });
    await newFile(companyId, job.id, { ...approved, uploadedById: USER, deletedAt: new Date(), fileName: "deleted.pdf" });
    expect(await shipmentAttachmentRepository.ownApprovalsSince(companyId, SINCE, 100)).toEqual([
      { shipmentId: job.id, jobNumber: job.jobNumber, fileName: "own.pdf", documentType: own.documentType, reviewedById: USER, reviewedAt: at("2026-11-16 10:00") },
    ]);
    expect(await shipmentAttachmentRepository.ownApprovalsSince(randomUUID(), SINCE, 100)).toEqual([]);
  });

  it("finds the requests a manager answered since then, in each of the two tables", async () => {
    const companyId = randomUUID();
    const job = await newJob(companyId);
    const file = await newFile(companyId, job.id);
    const documentRequest = (over: Partial<typeof documentChangeRequestTable.$inferInsert>) =>
      db.insert(documentChangeRequestTable).values({ companyId, shipmentId: job.id, attachmentId: file.id, fileName: "old.pdf", newFileName: "new.pdf", newStorageKey: randomUUID(), reason: "Wrong invoice", requestedById: USER, ...over });
    await documentRequest({ status: "approved", decidedAt: at("2026-11-12 10:00"), decidedByName: "Boss" });
    await documentRequest({ status: "rejected", decidedAt: at("2026-11-16 10:00"), decidedByName: "Boss", comment: "No" });
    await documentRequest({ status: "approved", decidedAt: at("2026-11-10 10:00") });
    await documentRequest({});
    const documents = await documentChangeRequestRepository.decidedSince(companyId, SINCE, 100);
    expect(documents.map((r) => [r.jobNumber, r.status, r.decidedByName, r.comment])).toEqual([
      [job.jobNumber, "rejected", "Boss", "No"],
      [job.jobNumber, "approved", "Boss", ""],
    ]);
    expect(await documentChangeRequestRepository.decidedSince(randomUUID(), SINCE, 100)).toEqual([]);

    const officeRequest = (over: Partial<typeof customsOfficeRequestTable.$inferInsert>) =>
      db.insert(customsOfficeRequestTable).values({ companyId, shipmentId: job.id, fromOffice: "CZ510201", toOffice: "CZ510202", reason: "Nearer", requestedById: USER, ...over });
    await officeRequest({ status: "approved", decidedAt: at("2026-11-13 10:00"), decidedByName: "Boss" });
    await officeRequest({ status: "rejected", decidedAt: at("2026-11-09 10:00") });
    await officeRequest({});
    const offices = await customsOfficeRequestRepository.decidedSince(companyId, SINCE, 100);
    expect(offices.map((r) => [r.jobNumber, r.status, r.fromOffice, r.toOffice])).toEqual([[job.jobNumber, "approved", "CZ510201", "CZ510202"]]);
  });

  it("gives the job numbers of the company's jobs asked about, deleted ones too", async () => {
    const companyId = randomUUID();
    const live = await newJob(companyId);
    const gone = await newJob(companyId, { deletedAt: new Date() });
    const theirs = await newJob(randomUUID());
    expect(await shipmentRepository.jobNumbersByIds(companyId, [live.id, gone.id, theirs.id])).toEqual(
      new Map([
        [live.id, live.jobNumber],
        [gone.id, gone.jobNumber],
      ]),
    );
    expect(await shipmentRepository.jobNumbersByIds(companyId, [])).toEqual(new Map());
  });
});
