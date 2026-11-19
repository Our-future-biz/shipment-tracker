import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { businessInstant } from "../../../../lib/businessDate";
import { db } from "../../db/db";
import type { ExtraJob } from "../../lib/managersCockpitExtra";
import { customsOfficeRequestRepository } from "../../repositories/customsOfficeRequest.repository";
import { documentChangeRequestRepository } from "../../repositories/documentChangeRequest.repository";
import { masterJobRepository } from "../../repositories/masterJob.repository";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";
import { shipmentAuditRepository } from "../../repositories/shipmentAudit.repository";
import { shipmentImportInstructionRepository } from "../../repositories/shipmentImportInstruction.repository";
import { cargoDimensionTable } from "../../schemas/cargoDimension.schema";
import { cargoItemTable } from "../../schemas/cargoItem.schema";
import { customsOfficeRequestTable } from "../../schemas/customsOfficeRequest.schema";
import { documentChangeRequestTable } from "../../schemas/documentChangeRequest.schema";
import { masterJobTable, type NewMasterJobRecord } from "../../schemas/masterJob.schema";
import { shipmentTable, type NewShipmentRecord } from "../../schemas/shipment.schema";
import { shipmentAttachmentTable, type NewShipmentAttachmentRecord } from "../../schemas/shipmentAttachment.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentImportInstructionTable, type ImportInstructionStatus } from "../../schemas/shipmentImportInstruction.schema";
import { extraSignals } from "../../services/managersCockpitExtra.service";

// The reads behind Shipments → Managers' step 2 signals, against the shipments database: each new
// repository method finds the rows of the company and the jobs asked about and nothing else, and
// the whole answer reads them together. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
let jobs = 7300;
// Wednesday 18 Nov 2026, 10:00 in Prague; Tuesday the 17th is a public holiday.
const at = (wall: string) => businessInstant(wall.slice(0, 10), wall.slice(11));
const NOW = at("2026-11-18 10:00");
const TODAY = "2026-11-18";

const newJob = async (companyId: string, over: Partial<Omit<NewShipmentRecord, "companyId" | "jobNumber">> = {}) => {
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", ...over }).returning();
  return row!;
};
const newFile = async (companyId: string, shipmentId: string, over: Partial<NewShipmentAttachmentRecord> = {}) => {
  const [row] = await db.insert(shipmentAttachmentTable).values({ companyId, shipmentId, fileName: "file.pdf", documentType: "Invoice", ...over }).returning();
  return row!;
};
const newDocumentRequest = (companyId: string, shipmentId: string, attachmentId: string, over: Partial<typeof documentChangeRequestTable.$inferInsert> = {}) =>
  db.insert(documentChangeRequestTable).values({ companyId, shipmentId, attachmentId, fileName: "old.pdf", newFileName: "new.pdf", newStorageKey: randomUUID(), reason: "Wrong invoice", requestedById: USER, ...over });
const newOfficeRequest = (companyId: string, shipmentId: string, over: Partial<typeof customsOfficeRequestTable.$inferInsert> = {}) =>
  db.insert(customsOfficeRequestTable).values({ companyId, shipmentId, fromOffice: "CZ510201", toOffice: "CZ510202", reason: "Nearer", requestedById: USER, ...over });
const newForm = (companyId: string, shipmentId: string, status: ImportInstructionStatus, over: Partial<typeof shipmentImportInstructionTable.$inferInsert> = {}) =>
  db.insert(shipmentImportInstructionTable).values({ companyId, shipmentId, tokenHash: randomUUID(), status, prefill: {}, createdByUserId: USER, expiresAt: at("2026-11-30 12:00"), ...over });
const newChange = (companyId: string, shipmentId: string, field: string, wall: string, over: Partial<typeof shipmentAuditTable.$inferInsert> = {}) =>
  db.insert(shipmentAuditTable).values({ companyId, shipmentId, userId: USER, field, changedAt: at(wall), ...over });
const newMaster = async (companyId: string, over: Partial<Omit<NewMasterJobRecord, "companyId">> = {}) => {
  const [row] = await db.insert(masterJobTable).values({ companyId, mczNumber: `MCZ${jobs++}`, ...over }).returning();
  return row!;
};
const sorted = <T>(rows: T[], key: (row: T) => string) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));

describe("the documents of the jobs", () => {
  it("are the live, classified files of the company's jobs asked about, each with its review and upload time", async () => {
    const companyId = randomUUID();
    const a = await newJob(companyId);
    const b = await newJob(companyId);
    const notAsked = await newJob(companyId);
    const reviewedAt = at("2026-11-16 12:00");
    await newFile(companyId, a.id, { documentType: "Invoice", customsStatus: "declined", customsReviewedAt: reviewedAt, createdAt: at("2026-11-13 09:00") });
    await newFile(companyId, a.id, { documentType: "Packing list" });
    await newFile(companyId, a.id, { documentType: "" });
    await newFile(companyId, a.id, { documentType: "MSDS", deletedAt: new Date() });
    await newFile(companyId, b.id, { documentType: "MSDS" });
    await newFile(companyId, notAsked.id, { documentType: "Invoice" });
    // Another company's file, even on a shipment id asked about by mistake.
    const otherCompany = randomUUID();
    const theirs = await newJob(otherCompany);
    await newFile(otherCompany, theirs.id, { documentType: "Invoice" });

    const rows = await shipmentAttachmentRepository.reviewFactsByShipmentIds([a.id, b.id, theirs.id], companyId);
    expect(sorted(rows, (r) => `${r.shipmentId === a.id ? "a" : "b"} ${r.documentType}`).map((r) => [r.shipmentId, r.documentType, r.customsStatus])).toEqual([
      [a.id, "Invoice", "declined"],
      [a.id, "Packing list", ""],
      [b.id, "MSDS", ""],
    ]);
    const invoice = rows.find((r) => r.documentType === "Invoice")!;
    expect(invoice.customsReviewedAt).toEqual(reviewedAt);
    expect(invoice.createdAt).toEqual(at("2026-11-13 09:00"));
    expect(await shipmentAttachmentRepository.reviewFactsByShipmentIds([], companyId)).toEqual([]);
  });
});

describe("the requests waiting for a manager", () => {
  it("are only those still waiting, on the jobs asked about", async () => {
    const companyId = randomUUID();
    const a = await newJob(companyId);
    const b = await newJob(companyId);
    const notAsked = await newJob(companyId);
    const [fileA, fileA2, fileB, fileC] = await Promise.all([newFile(companyId, a.id), newFile(companyId, a.id), newFile(companyId, b.id), newFile(companyId, notAsked.id)]);
    const asked = at("2026-11-16 10:00");
    await newDocumentRequest(companyId, a.id, fileA.id, { requestedAt: asked });
    await newDocumentRequest(companyId, a.id, fileA2.id, { status: "approved", decidedAt: new Date() });
    await newDocumentRequest(companyId, b.id, fileB.id, { status: "rejected", decidedAt: new Date(), comment: "No" });
    await newDocumentRequest(companyId, notAsked.id, fileC.id);
    expect(await documentChangeRequestRepository.waitingByShipmentIds([a.id, b.id], companyId)).toEqual([{ shipmentId: a.id, requestedAt: asked }]);
    expect(await documentChangeRequestRepository.waitingByShipmentIds([a.id, b.id], randomUUID())).toEqual([]);
    expect(await documentChangeRequestRepository.waitingByShipmentIds([], companyId)).toEqual([]);

    await newOfficeRequest(companyId, a.id, { status: "approved", decidedAt: new Date() });
    await newOfficeRequest(companyId, b.id, { requestedAt: asked });
    await newOfficeRequest(companyId, notAsked.id);
    expect(await customsOfficeRequestRepository.waitingByShipmentIds([a.id, b.id], companyId)).toEqual([{ shipmentId: b.id, requestedAt: asked }]);
    expect(await customsOfficeRequestRepository.waitingByShipmentIds([a.id, b.id], randomUUID())).toEqual([]);
    expect(await customsOfficeRequestRepository.waitingByShipmentIds([], companyId)).toEqual([]);
  });
});

describe("the live Import Instructions forms", () => {
  it("are the links not filled in and the answers waiting, never a form that was answered or cancelled", async () => {
    const companyId = randomUUID();
    const [open, sent, approved, cancelled, notAsked] = await Promise.all([newJob(companyId), newJob(companyId), newJob(companyId), newJob(companyId), newJob(companyId)]);
    const submittedAt = at("2026-11-16 10:00");
    await newForm(companyId, open.id, "open");
    // An earlier link of the same job, replaced since.
    await newForm(companyId, open.id, "cancelled");
    await newForm(companyId, sent.id, "submitted", { submittedAt });
    await newForm(companyId, approved.id, "approved", { submittedAt, decidedAt: new Date() });
    await newForm(companyId, cancelled.id, "cancelled");
    await newForm(companyId, notAsked.id, "open");

    const ids = [open.id, sent.id, approved.id, cancelled.id];
    const rows = await shipmentImportInstructionRepository.liveByShipmentIds(ids, companyId);
    expect(sorted(rows, (r) => r.status)).toEqual([
      { shipmentId: open.id, status: "open", submittedAt: null, expiresAt: at("2026-11-30 12:00") },
      { shipmentId: sent.id, status: "submitted", submittedAt, expiresAt: at("2026-11-30 12:00") },
    ]);
    expect(await shipmentImportInstructionRepository.liveByShipmentIds(ids, randomUUID())).toEqual([]);
    expect(await shipmentImportInstructionRepository.liveByShipmentIds([], companyId)).toEqual([]);
  });
});

describe("the newest change of a field in the jobs' history", () => {
  it("is one row per job and field, the latest, for the fields each job was asked about - all asks in one read", async () => {
    const companyId = randomUUID();
    const a = await newJob(companyId);
    const b = await newJob(companyId);
    const notAsked = await newJob(companyId);
    await newChange(companyId, a.id, "status", "2026-11-10 09:00", { newValue: "Booking Confirmation Pending [IMP]" });
    await newChange(companyId, a.id, "status", "2026-11-12 09:00", { newValue: "Booked For Further Transport [IMP]" });
    await newChange(companyId, a.id, "status", "2026-11-11 09:00", { newValue: "Customs Clearance Pending [IMP]" });
    await newChange(companyId, a.id, "customsStatus", "2026-11-09 09:00", { newValue: "Under Customs Clearance" });
    await newChange(companyId, a.id, "estimatedArrival", "2026-11-17 09:00", { newValue: "2026-11-20" });
    await newChange(companyId, b.id, "status", "2026-11-05 09:00", { newValue: "Billing [IMP]" });
    await newChange(companyId, b.id, "customsStatus", "2026-11-06 09:00", { newValue: "Paperwork Verified" });
    await newChange(companyId, b.id, "remeasurementAccepted", "2026-11-07 09:00");
    await newChange(companyId, notAsked.id, "status", "2026-11-17 09:00");

    const found = async (asks: { fields: string[]; shipmentIds: string[] }[], company = companyId) =>
      sorted(await shipmentAuditRepository.latestByShipmentIds(company, asks), (r) => `${r.shipmentId === a.id ? "a" : "b"} ${r.field}`).map((r) => [r.shipmentId, r.field, r.newValue, r.changedAt]);

    expect(await found([{ fields: ["status", "customsStatus"], shipmentIds: [a.id, b.id] }])).toEqual([
      [a.id, "customsStatus", "Under Customs Clearance", at("2026-11-09 09:00")],
      [a.id, "status", "Booked For Further Transport [IMP]", at("2026-11-12 09:00")],
      [b.id, "customsStatus", "Paperwork Verified", at("2026-11-06 09:00")],
      [b.id, "status", "Billing [IMP]", at("2026-11-05 09:00")],
    ]);
    // Each ask for its own jobs: the status of one, the customs status of the other, a remeasurement of both.
    expect(
      await found([
        { fields: ["remeasurementAccepted"], shipmentIds: [a.id, b.id] },
        { fields: ["status"], shipmentIds: [b.id] },
        { fields: ["customsStatus"], shipmentIds: [a.id] },
      ]),
    ).toEqual([
      [a.id, "customsStatus", "Under Customs Clearance", at("2026-11-09 09:00")],
      [b.id, "remeasurementAccepted", null, at("2026-11-07 09:00")],
      [b.id, "status", "Billing [IMP]", at("2026-11-05 09:00")],
    ]);
    // An ask with no job or no field asks nothing; with nothing asked there is no read at all.
    expect(await found([{ fields: ["status"], shipmentIds: [] }, { fields: [], shipmentIds: [a.id] }, { fields: ["customsStatus"], shipmentIds: [a.id] }])).toEqual([[a.id, "customsStatus", "Under Customs Clearance", at("2026-11-09 09:00")]]);
    expect(await found([{ fields: ["status"], shipmentIds: [] }])).toEqual([]);
    expect(await found([])).toEqual([]);
    expect(await found([{ fields: ["status"], shipmentIds: [a.id, b.id] }], randomUUID())).toEqual([]);
  });
});

describe("the master jobs the cockpit reads", () => {
  it("are the live ones asked about, and those that have not departed with an ETD in the window", async () => {
    const companyId = randomUUID();
    const house = await newMaster(companyId, { closingDate: "2026-11-20", estimatedDeparture: "2026-12-20" });
    const soon = await newMaster(companyId, { estimatedDeparture: "2026-11-28", shipper: "ACME s.r.o.", personInCharge: "jan@firma.cz" });
    const today = await newMaster(companyId, { estimatedDeparture: "2026-11-18" });
    await newMaster(companyId, { estimatedDeparture: "2026-11-29" });
    await newMaster(companyId, { estimatedDeparture: "2026-11-17" });
    await newMaster(companyId, { estimatedDeparture: "2026-11-20", actualDeparture: "2026-11-18" });
    await newMaster(companyId, { estimatedDeparture: "2026-11-20", deletedAt: new Date() });
    await newMaster(companyId);
    const deleted = await newMaster(companyId, { closingDate: "2026-11-20", deletedAt: new Date() });
    const theirs = await newMaster(randomUUID(), { estimatedDeparture: "2026-11-20" });

    const rows = await masterJobRepository.cockpitFacts(companyId, [house.id, deleted.id, theirs.id], "2026-11-18", "2026-11-28");
    expect(rows.map((r) => r.id).sort()).toEqual([house.id, soon.id, today.id].sort());
    expect(rows.find((r) => r.id === soon.id)).toEqual({
      id: soon.id,
      mczNumber: soon.mczNumber,
      freightMode: "",
      tradeDirection: "",
      shipper: "ACME s.r.o.",
      consignee: "",
      personInCharge: "jan@firma.cz",
      holidayCover: "",
      closingDate: null,
      estimatedDeparture: "2026-11-28",
      actualDeparture: null,
      actualArrival: null,
    });
    // With no job read, the window alone finds them.
    expect((await masterJobRepository.cockpitFacts(companyId, [], "2026-11-18", "2026-11-28")).map((r) => r.id).sort()).toEqual([soon.id, today.id].sort());
  });
});

describe("the step 2 signals, read from the database", () => {
  it("gives each job the signals of its own rows, and a master job with no shipment a row of its own", async () => {
    const companyId = randomUUID();
    const consol = await newMaster(companyId, { closingDate: "2026-11-20", tradeDirection: "Export" });
    const empty = await newMaster(companyId, { estimatedDeparture: "2026-11-21", tradeDirection: "Import", consignee: "Globex Ltd" });
    // Leaves soon as well, but its one shipment is not among the jobs read.
    const elsewhere = await newMaster(companyId, { estimatedDeparture: "2026-11-21" });
    await newJob(companyId, { masterJobId: elsewhere.id });

    const arriving = await newJob(companyId, { estimatedArrival: "2026-11-19" });
    const busy = await newJob(companyId, { tradeDirection: "Export", masterJobId: consol.id, dangerous: "Yes", closingDate: "2026-11-20" });
    const quiet = await newJob(companyId);
    // An import house of the same Master Job, and an import delivered without its paperwork: neither is tagged.
    const importHouse = await newJob(companyId, { masterJobId: consol.id });
    const delivered = await newJob(companyId, { estimatedArrival: "2026-11-10", actualArrival: "2026-11-11", actualDeliveryDate: "2026-11-13" });
    for (const job of [busy, quiet, importHouse]) {
      await newFile(companyId, job.id, { documentType: "Invoice", customsStatus: "approved" });
      await newFile(companyId, job.id, { documentType: "Packing list", customsStatus: "approved" });
    }
    const replaced = await newFile(companyId, busy.id, { documentType: "Customs document", customsStatus: "approved" });
    await newDocumentRequest(companyId, busy.id, replaced.id, { requestedAt: at("2026-11-13 09:00") });
    await newForm(companyId, arriving.id, "open");
    await newChange(companyId, busy.id, "status", "2026-11-05 09:00", { newValue: "Booking Confirmation Pending [EXP]" });
    await newChange(companyId, busy.id, "remeasureInformed", "2026-11-17 09:00", {
      oldValue: JSON.stringify({ colli: 10, weightKg: 1000, volumeCbm: 5 }),
      newValue: JSON.stringify({ colli: 10, weightKg: 1200, volumeCbm: 5, comparedWith: "declared" }),
    });

    const asJob = (row: typeof busy, over: Partial<ExtraJob> = {}): ExtraJob => ({ ...row, ...over });
    const out = await extraSignals([asJob(arriving), asJob(busy, { status: "Booking Confirmation Pending [EXP]" }), asJob(quiet), asJob(importHouse), asJob(delivered)], { companyId, now: NOW, today: TODAY, holidays: [] });

    expect(out.notKnown).toEqual([]);
    expect([...out.byJob.keys()].sort()).toEqual([arriving.id, busy.id].sort());
    expect(out.byJob.get(arriving.id)!.map((s) => s.text)).toEqual(["Waiting For Commercial Paperwork · arriving tomorrow", "Import Instructions not filled in by the customer · arriving tomorrow"]);
    expect(out.byJob.get(busy.id)!.map((s) => s.text)).toEqual([
      "Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing on Fri 20.11.",
      "Document change waiting for approval since 13.11. 09:00",
      "Remeasurement differs, not accepted since 17.11. 09:00",
      "Status unchanged since 05.11.",
      `Master Job ${consol.mczNumber}: Closing on Fri 20.11. · SI not confirmed, BoL draft not approved, cargo not received`,
    ]);
    expect(out.masterJobRows.map((r) => [r.id, r.number, r.customer, r.signals.map((s) => s.text)])).toEqual([[empty.id, empty.mczNumber, "Globex Ltd", ["No shipment linked · ETD on Sat 21.11."]]]);
  });

  it("reads a remeasurement from Warehouse Concept as a warning to check Cargo Details by hand, until the shipment as it shows matches it (X4, Y4)", async () => {
    const companyId = randomUUID();
    const differs = await newJob(companyId, { pcs: "10", totalWeightTons: "1.0000", totalVolumeCbm: "5.0000" });
    // Cargo Details saves lines, not Pcs or Total Weight - and a job made from a quote never stores a Pcs.
    const lines = await newJob(companyId, { pcs: "", totalWeightTons: null, totalVolumeCbm: null });
    await db.insert(cargoDimensionTable).values({ companyId, shipmentId: lines.id, pieces: "10", lengthCm: "100", widthCm: "100", heightCm: "50", weightPerPcKg: "120" });
    // A stale stored Pcs and Total Weight that say the same as the warehouse, while the cargo lines hold 8 pieces.
    const stale = await newJob(companyId, { pcs: "10", totalWeightTons: "1.2000", totalVolumeCbm: "5.0000" });
    await db.insert(cargoItemTable).values({ companyId, shipmentId: stale.id, pieces: "8", grossWeight: "1200" });
    // A deleted line is no line: the shipment shows its stored figures, which differ.
    await db.insert(cargoDimensionTable).values({ companyId, shipmentId: differs.id, pieces: "10", lengthCm: "100", widthCm: "100", heightCm: "50", weightPerPcKg: "120", deletedAt: new Date() });
    // Another company's lines on a job asked about by mistake count for nothing.
    await db.insert(cargoDimensionTable).values({ companyId: randomUUID(), shipmentId: differs.id, pieces: "10", lengthCm: "100", widthCm: "100", heightCm: "50", weightPerPcKg: "120" });
    for (const job of [differs, lines, stale]) {
      await newFile(companyId, job.id, { documentType: "Invoice", customsStatus: "approved" });
      await newFile(companyId, job.id, { documentType: "Packing list", customsStatus: "approved" });
      await newChange(companyId, job.id, "remeasureInformed", "2026-11-16 09:00", {
        oldValue: JSON.stringify({ colli: 10, weightKg: 1000, volumeCbm: 5 }),
        newValue: JSON.stringify({ colli: 10, weightKg: 1200, volumeCbm: 5, comparedWith: "declared", source: "warehouseConcept" }),
      });
    }
    const out = await extraSignals([differs, lines, stale], { companyId, now: NOW, today: TODAY, holidays: [] });
    const warning = [["Remeasured in Warehouse Concept: check Cargo Details by hand · informed 16.11. 09:00", false]];
    expect(out.notKnown).toEqual([]);
    expect(out.byJob.get(differs.id)!.map((s) => [s.text, s.urgent])).toEqual(warning);
    // The lines say what the warehouse measured: nothing left to check.
    expect(out.byJob.has(lines.id)).toBe(false);
    // The stored Pcs no longer ends it: the shipment shows the 8 pieces of its lines.
    expect(out.byJob.get(stale.id)!.map((s) => [s.text, s.urgent])).toEqual(warning);
  });
});
