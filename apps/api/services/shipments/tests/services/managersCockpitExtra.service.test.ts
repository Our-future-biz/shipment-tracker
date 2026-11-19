import { beforeEach, describe, expect, it, vi } from "vitest";

const attachments = vi.hoisted(() => ({ reviewFactsByShipmentIds: vi.fn() }));
const documentRequests = vi.hoisted(() => ({ waitingByShipmentIds: vi.fn() }));
const officeRequests = vi.hoisted(() => ({ waitingByShipmentIds: vi.fn() }));
const forms = vi.hoisted(() => ({ liveByShipmentIds: vi.fn() }));
const audit = vi.hoisted(() => ({ latestByShipmentIds: vi.fn() }));
const masterJobs = vi.hoisted(() => ({ cockpitFacts: vi.fn(), shipmentCounts: vi.fn() }));
const containers = vi.hoisted(() => ({ listByShipmentIds: vi.fn() }));
const cargoItems = vi.hoisted(() => ({ listByShipmentIds: vi.fn() }));
const dimensions = vi.hoisted(() => ({ listByShipmentIds: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: containers }));
vi.mock("../../repositories/cargoItem.repository", () => ({ cargoItemRepository: cargoItems }));
vi.mock("../../repositories/cargoDimension.repository", () => ({ cargoDimensionRepository: dimensions }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: attachments }));
vi.mock("../../repositories/documentChangeRequest.repository", () => ({ documentChangeRequestRepository: documentRequests }));
vi.mock("../../repositories/customsOfficeRequest.repository", () => ({ customsOfficeRequestRepository: officeRequests }));
vi.mock("../../repositories/shipmentImportInstruction.repository", () => ({ shipmentImportInstructionRepository: forms }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: audit }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: masterJobs }));
vi.mock("encore.dev/log", () => ({ default: log }));
// lib/remeasureNotice reads lib/personPick, which names encore.dev/api: the real one loads the Encore runtime.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { businessInstant } from "../../../../lib/businessDate";
import type { ExtraJob } from "../../lib/managersCockpitExtra";
import { EXTRA_PARTS, extraSignals, jobChargeOf, remeasureSource } from "../../services/managersCockpitExtra.service";

// The reads behind Shipments → Managers' step 2 signals, against stand-ins for the repositories:
// that each part is asked once for all the jobs, that every job gets its own facts, and that a
// part which cannot be read is named and gives no signal while the others still answer. The
// rules themselves are tests/managersCockpitExtra.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// Wednesday 18 Nov 2026, 10:00 in Prague; Tuesday the 17th is a public holiday.
const at = (wall: string) => businessInstant(wall.slice(0, 10), wall.slice(11));
const CTX = { companyId: COMPANY, now: at("2026-11-18 10:00"), today: "2026-11-18", holidays: [] as string[] };

const job = (id: string, over: Partial<ExtraJob> = {}): ExtraJob => ({
  id,
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  status: "Booked For Further Transport [IMP]",
  customsPriority: "Standard",
  customsStatus: "",
  customsDeadline: "",
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
  actualDeliveryDate: null,
  closingDate: null,
  shippingInstructions: "Confirmed",
  bolDraft: "Approved",
  masterBolType: "",
  dangerous: "No",
  masterJobId: null,
  customsProcedure: "",
  customsOffice: "",
  mrn: "",
  warehouseReceivedDate: null,
  createdAt: at("2026-11-16 09:00"),
  ...over,
});

const file = (shipmentId: string, documentType: string, customsStatus = "approved", over = {}) => ({
  shipmentId,
  documentType,
  customsStatus,
  customsReviewedAt: customsStatus ? at("2026-11-16 12:00") : null,
  createdAt: at("2026-11-16 10:00"),
  ...over,
});
/** An invoice and a packing list, both approved: the paperwork is verified. */
const verified = (shipmentId: string) => [file(shipmentId, "Invoice"), file(shipmentId, "Packing list")];
const change = (shipmentId: string, field: string, wall: string, over = {}) => ({ id: `${shipmentId}-${field}`, companyId: COMPANY, shipmentId, userId: "u1", field, oldValue: null, newValue: null, changedAt: at(wall), ...over });
const master = (id: string, over = {}) => ({
  id,
  mczNumber: "MCZCONSOL00000012",
  freightMode: "Sea Freight",
  tradeDirection: "Export",
  shipper: "ACME s.r.o.",
  consignee: "Globex Ltd",
  personInCharge: "jan@firma.cz",
  holidayCover: "",
  closingDate: null,
  estimatedDeparture: null,
  actualDeparture: null,
  actualArrival: null,
  ...over,
});
/** What the history answers: `rows` for the fields asked about, whichever jobs they were asked for. */
type Ask = { fields: string[]; shipmentIds: string[] };
const history = (rows: ReturnType<typeof change>[]) => async (_company: string, asks: Ask[]) => rows.filter((r) => asks.some((a) => a.fields.includes(r.field) && a.shipmentIds.includes(r.shipmentId)));

const texts = (signals: { text: string }[] | undefined) => (signals ?? []).map((s) => s.text);

beforeEach(() => {
  vi.clearAllMocks();
  attachments.reviewFactsByShipmentIds.mockResolvedValue([]);
  documentRequests.waitingByShipmentIds.mockResolvedValue([]);
  officeRequests.waitingByShipmentIds.mockResolvedValue([]);
  forms.liveByShipmentIds.mockResolvedValue([]);
  audit.latestByShipmentIds.mockResolvedValue([]);
  masterJobs.cockpitFacts.mockResolvedValue([]);
  masterJobs.shipmentCounts.mockResolvedValue(new Map());
  containers.listByShipmentIds.mockResolvedValue([]);
  cargoItems.listByShipmentIds.mockResolvedValue([]);
  dimensions.listByShipmentIds.mockResolvedValue([]);
});

describe("the reads of the cockpit's step 2 signals", () => {
  it("asks each part once, for all the jobs of the company together", async () => {
    const jobs = [job("a", { masterJobId: "m1" }), job("b", { masterJobId: "m1" }), job("c", { masterJobId: "m2" })];
    await extraSignals(jobs, CTX);
    const ids = ["a", "b", "c"];
    expect(attachments.reviewFactsByShipmentIds).toHaveBeenCalledExactlyOnceWith(ids, COMPANY);
    expect(documentRequests.waitingByShipmentIds).toHaveBeenCalledExactlyOnceWith(ids, COMPANY);
    expect(officeRequests.waitingByShipmentIds).toHaveBeenCalledExactlyOnceWith(ids, COMPANY);
    expect(forms.liveByShipmentIds).toHaveBeenCalledExactlyOnceWith(ids, COMPANY);
    // The history in one read: the remeasurement of every job, nothing else where no rule would read it.
    expect(audit.latestByShipmentIds).toHaveBeenCalledExactlyOnceWith(COMPANY, [
      { fields: ["remeasureInformed", "remeasurementAccepted", "remeasurementCostsChecked"], shipmentIds: ids },
      { fields: ["status"], shipmentIds: [] },
      { fields: ["customsStatus"], shipmentIds: [] },
    ]);
    // The master jobs the jobs are houses of, each once, and those leaving within 10 working days of today (Wed 2 Dec; Y5).
    expect(masterJobs.cockpitFacts).toHaveBeenCalledExactlyOnceWith(COMPANY, ["m1", "m2"], "2026-11-18", "2026-12-02");
  });

  it("asks the history for a status only where it is watched, and for the customs status only under clearance", async () => {
    const jobs = [
      job("waiting", { status: "Delivery Date Pending From Customer [IMP]" }),
      job("moving"),
      // Trucking's job: its status never moves, so nobody asks how long it has stood.
      job("trucking", { tradeDirection: "Domestic", department: "Road Department", status: "Booking Confirmation Pending [DOM]" }),
      job("clearing", { customsStatus: "Under Customs Clearance" }),
      job("cleared", { customsStatus: "Customs Cleared/Released", status: "Booking Confirmation Pending [EXP]" }),
    ];
    await extraSignals(jobs, CTX);
    expect(audit.latestByShipmentIds).toHaveBeenCalledExactlyOnceWith(COMPANY, [
      { fields: ["remeasureInformed", "remeasurementAccepted", "remeasurementCostsChecked"], shipmentIds: ["waiting", "moving", "trucking", "clearing", "cleared"] },
      { fields: ["status"], shipmentIds: ["waiting", "cleared"] },
      { fields: ["customsStatus"], shipmentIds: ["clearing"] },
    ]);
  });

  it("answers nothing, and names nothing, when all is in order", async () => {
    attachments.reviewFactsByShipmentIds.mockResolvedValue(verified("a"));
    const out = await extraSignals([job("a")], CTX);
    expect(out).toEqual({ byJob: new Map(), masterJobRows: [], notKnown: [] });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("gives each job the signals of its own facts, every one with its kind", async () => {
    const jobs = [
      // Arrives tomorrow with no paperwork and an original BoL not in hand.
      job("a", { estimatedArrival: "2026-11-19", masterBolType: "OBL" }),
      // Dangerous goods closing in 2 days; a request waiting since Friday; a status that waits since the 2nd.
      job("b", { tradeDirection: "Export", dangerous: "Yes", closingDate: "2026-11-20", status: "Booking Confirmation Pending [EXP]", createdAt: at("2026-11-02 09:00") }),
      // The customer's answers waiting since Friday; a remeasurement that differs since Monday.
      job("c"),
      // Under Customs Clearance since the 10th, no MRN needed yet.
      job("d", { customsStatus: "Under Customs Clearance" }),
      job("e"),
    ];
    attachments.reviewFactsByShipmentIds.mockResolvedValue([...verified("b"), file("b", "MSDS", ""), ...verified("c"), ...verified("d"), ...verified("e")]);
    documentRequests.waitingByShipmentIds.mockResolvedValue([{ shipmentId: "b", requestedAt: at("2026-11-13 09:00") }]);
    officeRequests.waitingByShipmentIds.mockResolvedValue([{ shipmentId: "b", requestedAt: at("2026-11-13 11:00") }]);
    forms.liveByShipmentIds.mockResolvedValue([{ shipmentId: "c", status: "submitted", submittedAt: at("2026-11-13 14:00"), expiresAt: at("2026-11-27 14:00") }]);
    audit.latestByShipmentIds.mockImplementation(
      history([
        change("d", "customsStatus", "2026-11-10 09:00", { newValue: "Under Customs Clearance" }),
        // On record, but nobody asks: its status waits for nobody.
        change("e", "status", "2026-11-10 09:00"),
        change("c", "remeasureInformed", "2026-11-16 10:00", { oldValue: JSON.stringify({ colli: 10, weightKg: 1000, volumeCbm: 5 }), newValue: JSON.stringify({ colli: 10, weightKg: 1200, volumeCbm: 5, comparedWith: "declared" }) }),
      ]),
    );

    const out = await extraSignals(jobs, CTX);
    expect(out.notKnown).toEqual([]);
    expect([...out.byJob.keys()]).toEqual(["a", "b", "c", "d"]);
    expect(texts(out.byJob.get("a"))).toEqual(["Master BoL is an OBL, not in hand · arriving tomorrow", "Waiting For Commercial Paperwork · arriving tomorrow"]);
    expect(texts(out.byJob.get("b"))).toEqual([
      "Dangerous goods: no Dangerous Goods Declaration · Closing on Fri 20.11.",
      "Document change waiting for approval since 13.11. 09:00",
      "Customs Office change waiting for approval since 13.11. 11:00",
      "Status unchanged since 02.11.",
    ]);
    expect(texts(out.byJob.get("c"))).toEqual(["Import Instructions from the customer not answered since 13.11. 14:00", "Remeasurement differs, not accepted since 16.11. 10:00"]);
    expect(texts(out.byJob.get("d"))).toEqual(["Under Customs Clearance since 10.11."]);
    for (const signals of out.byJob.values()) {
      for (const s of signals) expect(s).toMatchObject({ kind: expect.any(String), area: expect.any(String), rank: expect.any(Number), urgent: expect.any(Boolean) });
    }
    expect(out.byJob.get("a")!.map((s) => (s as { kind?: string }).kind)).toEqual(["bl", "paperwork"]);
  });

  it("reads the remeasurement as the Alerts tab does: the figures of the last Inform Operations, an acceptance after it", async () => {
    const figures = (weightKg: number) => JSON.stringify({ colli: 10, weightKg, volumeCbm: 5 });
    attachments.reviewFactsByShipmentIds.mockResolvedValue([...verified("a"), ...verified("b"), ...verified("c")]);
    audit.latestByShipmentIds.mockImplementation(
      history([
        // Matches: nothing to accept.
        change("a", "remeasureInformed", "2026-11-13 10:00", { oldValue: figures(1000), newValue: figures(1000) }),
        // Differs, accepted on Monday, costs not checked since.
        change("b", "remeasureInformed", "2026-11-13 10:00", { oldValue: figures(1000), newValue: figures(1200) }),
        change("b", "remeasurementAccepted", "2026-11-16 09:00"),
        change("b", "remeasurementCostsChecked", "2026-11-12 09:00"),
        // Figures nobody can read: not known to differ.
        change("c", "remeasureInformed", "2026-11-13 10:00", { oldValue: "{", newValue: null }),
      ]),
    );
    const out = await extraSignals([job("a"), job("b"), job("c")], CTX);
    expect([...out.byJob.keys()]).toEqual(["b"]);
    expect(out.byJob.get("b")).toEqual([{ rank: 39, text: "Remeasurement accepted 16.11., costs not checked", urgent: false, area: "finance", kind: "remeasurement" }]);
  });

  // A Sea Full Load job with no volume typed, the warehouse measured 20 m³: charged per container,
  // so Alerts and the chat said the charge stays the same. Judged with no charge, the cockpit took
  // it for a W/M change and named it urgent, "differs, not accepted".
  it("judges a remeasurement by the charge kept on the inform, else by the job's own Freight Mode and Load Type", async () => {
    const old = JSON.stringify({ colli: 10, weightKg: 1000, volumeCbm: 0 });
    const measured = (over = {}) => JSON.stringify({ colli: 10, weightKg: 1000, volumeCbm: 20, ...over });
    attachments.reviewFactsByShipmentIds.mockResolvedValue(["full", "lcl", "kept", "unread"].flatMap(verified));
    audit.latestByShipmentIds.mockImplementation(
      history([
        // Written before the charge was kept: the job's own decides.
        change("full", "remeasureInformed", "2026-11-13 10:00", { oldValue: old, newValue: measured() }),
        change("lcl", "remeasureInformed", "2026-11-13 10:00", { oldValue: old, newValue: measured() }),
        // The charge it was judged by when informed wins over the job's as it is now.
        change("kept", "remeasureInformed", "2026-11-13 10:00", { oldValue: old, newValue: measured({ charge: "wm" }) }),
        // A row read without its Load Type: the cautious default.
        change("unread", "remeasureInformed", "2026-11-13 10:00", { oldValue: old, newValue: measured() }),
      ]),
    );
    const out = await extraSignals(
      [job("full", { loadType: "Full Load" }), job("lcl", { loadType: "LCL" }), job("kept", { loadType: "Full Load" }), job("unread")],
      CTX,
    );
    expect(out.byJob.get("full")).toBeUndefined();
    expect(texts(out.byJob.get("lcl"))).toEqual(["Remeasurement differs, not accepted since 13.11. 10:00"]);
    expect(texts(out.byJob.get("kept"))).toEqual(["Remeasurement differs, not accepted since 13.11. 10:00"]);
    expect(texts(out.byJob.get("unread"))).toEqual(["Remeasurement differs, not accepted since 13.11. 10:00"]);
  });

  it("jobChargeOf: the job's charge only when the row carries its Load Type", () => {
    expect(jobChargeOf({ freightMode: "Sea Freight", loadType: "Full Load" })).toBe("container");
    expect(jobChargeOf({ freightMode: "Rail Freight", loadType: "Full Load" })).toBe("container");
    expect(jobChargeOf({ freightMode: "Sea Freight", loadType: "LCL" })).toBe("wm");
    expect(jobChargeOf({ freightMode: "Air Freight", loadType: null })).toBe("air");
    expect(jobChargeOf({ freightMode: "Sea Freight" })).toBeUndefined();
  });

  describe("a remeasurement from Warehouse Concept (X4, Y4)", () => {
    const concept = (weightKg: number) => JSON.stringify({ colli: 10, weightKg, volumeCbm: 5, comparedWith: "declared", source: "warehouseConcept" });
    const old = JSON.stringify({ colli: 10, weightKg: 1000, volumeCbm: 5 });
    const WARNING = { rank: 38, text: "Remeasured in Warehouse Concept: check Cargo Details by hand · informed 16.11. 10:00", urgent: false, area: "details", kind: "remeasurement" };
    const stored = { pcs: "10", totalWeightTons: "1.0000", totalVolumeCbm: "5.0000" };
    // 10 pieces of 120 kg, 100 × 100 × 50 cm: 1,200 kg and 5 m³ - what the warehouse remeasured.
    const line = (shipmentId: string, over = {}) => ({ shipmentId, pieces: "10", lengthCm: "100", widthCm: "100", heightCm: "50", weightPerPcKg: "120", volumePerPcM3: "", ...over });
    const informedOn = (ids: string[], wall = "2026-11-16 10:00", newValue = concept(1200)) => ids.map((id) => change(id, "remeasureInformed", wall, { oldValue: old, newValue }));

    beforeEach(() => {
      attachments.reviewFactsByShipmentIds.mockResolvedValue(["a", "b", "c", "d", "e"].flatMap(verified));
    });

    it("is a warning until the shipment as it shows - its Cargo Details lines - says the same, as the Alerts tab judges it", async () => {
      audit.latestByShipmentIds.mockImplementation(history(informedOn(["a", "b", "c", "d", "e"])));
      // c: Cargo Details lines saved with the remeasured figures, nothing stored in Pcs or Total Weight - a job made from a quote.
      dimensions.listByShipmentIds.mockResolvedValue([line("c")]);
      // d: a stale stored Pcs and a typed Total Weight, but its cargo lines hold 8 pieces: the shipment shows 8.
      cargoItems.listByShipmentIds.mockResolvedValue([{ shipmentId: "d", pieces: "8", grossWeight: "1200", packageType: "Pallets", hsCode: "", cargoDescription: "" }]);
      const out = await extraSignals(
        [
          job("a", stored),
          job("b", { ...stored, totalWeightTons: "1.2000" }),
          job("c", { pcs: "", totalWeightTons: null, totalVolumeCbm: null }),
          job("d", { ...stored, totalWeightTons: "1.2000" }),
          job("e"),
        ],
        CTX,
      );
      expect(out.byJob.get("a")).toEqual([WARNING]);
      // A Total Weight typed to the remeasured weight on a job with no lines: what the shipment shows matches.
      expect(out.byJob.get("b")).toBeUndefined();
      // The lines say the same: nothing left to check, no week to wait.
      expect(out.byJob.get("c")).toBeUndefined();
      // The stored Pcs no longer ends it: the lines show 8 pieces, Warehouse Concept counted 10.
      expect(out.byJob.get("d")).toEqual([WARNING]);
      // The row read without the figures and no lines: not known to match, the warning stands.
      expect(out.byJob.get("e")).toEqual([WARNING]);
      expect(out.notKnown).toEqual([]);
      expect(remeasureSource(concept(1))).toBe("warehouseConcept");
      expect(remeasureSource(old)).toBe("warehouse");
      expect(remeasureSource("{")).toBe("warehouse");
    });

    it("reads the Cargo Details rows only of the jobs whose latest remeasurement is Warehouse Concept's, differs, is not accepted and is younger than a week", async () => {
      audit.latestByShipmentIds.mockImplementation(
        history([
          ...informedOn(["a"]),
          // The Warehouse's own: its Accept takes the lines.
          change("b", "remeasureInformed", "2026-11-16 10:00", { oldValue: old, newValue: JSON.stringify({ colli: 10, weightKg: 1200, volumeCbm: 5, comparedWith: "dimensions" }) }),
          // Within Warehouse Concept's 5 % tolerance: no warning to end.
          ...informedOn(["c"], "2026-11-16 10:00", concept(1030)),
          // Accepted since.
          ...informedOn(["d"]),
          change("d", "remeasurementAccepted", "2026-11-17 09:00"),
          // Informed more than 7 days ago: over by itself.
          ...informedOn(["e"], "2026-11-10 10:00"),
        ]),
      );
      const out = await extraSignals([job("a"), job("b"), job("c"), job("d"), job("e"), job("f")], CTX);
      expect(containers.listByShipmentIds).toHaveBeenCalledExactlyOnceWith(["a"], COMPANY);
      expect(cargoItems.listByShipmentIds).toHaveBeenCalledExactlyOnceWith(["a"], COMPANY);
      expect(dimensions.listByShipmentIds).toHaveBeenCalledExactlyOnceWith(["a"], COMPANY);
      expect(out.byJob.get("a")).toEqual([WARNING]);
      expect(out.byJob.has("e")).toBe(false);
    });

    it("reads no rows at all when no job has such a remeasurement", async () => {
      await extraSignals([job("a"), job("b")], CTX);
      expect(containers.listByShipmentIds).not.toHaveBeenCalled();
      expect(cargoItems.listByShipmentIds).not.toHaveBeenCalled();
      expect(dimensions.listByShipmentIds).not.toHaveBeenCalled();
    });

    it("keeps the warning and names the part when the rows cannot be read", async () => {
      audit.latestByShipmentIds.mockImplementation(history(informedOn(["c"])));
      dimensions.listByShipmentIds.mockRejectedValue(new Error("no lines"));
      const out = await extraSignals([job("c", { pcs: "", totalWeightTons: null, totalVolumeCbm: null })], CTX);
      expect(out.byJob.get("c")).toEqual([WARNING]);
      expect(out.notKnown).toEqual([EXTRA_PARTS.cargoDetails]);
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(expect.any(Error), "a part of Shipments → Managers could not be read", { part: EXTRA_PARTS.cargoDetails });
    });
  });

  it("counts Quantities checked only for the acceptance it names, not by when it was written", async () => {
    const accepted = at("2026-11-16 09:00");
    attachments.reviewFactsByShipmentIds.mockResolvedValue([...verified("a"), ...verified("b")]);
    audit.latestByShipmentIds.mockImplementation(
      history([
        // Checked for this acceptance: nothing to say.
        change("a", "remeasurementAccepted", "2026-11-16 09:00"),
        change("a", "remeasurementCostsChecked", "2026-11-16 10:00", { newValue: accepted.toISOString() }),
        // Written after the acceptance, but naming an earlier one: the latest acceptance is not checked.
        change("b", "remeasurementAccepted", "2026-11-16 09:00"),
        change("b", "remeasurementCostsChecked", "2026-11-16 10:00", { newValue: at("2026-11-10 09:00").toISOString() }),
      ]),
    );
    const out = await extraSignals([job("a"), job("b")], CTX);
    expect([...out.byJob.keys()]).toEqual(["b"]);
  });

  it("ages Under Customs Clearance only by the change that set it", async () => {
    attachments.reviewFactsByShipmentIds.mockResolvedValue(verified("a"));
    // The last change of the customs status on record set another step: since when it stands is not known.
    audit.latestByShipmentIds.mockImplementation(history([change("a", "customsStatus", "2026-11-02 09:00", { newValue: "Paperwork Verified" })]));
    const out = await extraSignals([job("a", { customsStatus: "Under Customs Clearance" })], CTX);
    expect(out.byJob.size).toBe(0);
  });

  it("tags the houses of a Master Job that closes soon, and makes one with no shipment a row of its own", async () => {
    const jobs = [
      job("a", { tradeDirection: "Export", masterJobId: "m1", shippingInstructions: "Not Received" }),
      job("b", { tradeDirection: "Export", masterJobId: "m1", warehouseReceivedDate: "2026-11-17" }),
      // An import house of the same Master Job owes none of an export's duties.
      job("c", { masterJobId: "m1", shippingInstructions: "Not Received" }),
    ];
    attachments.reviewFactsByShipmentIds.mockResolvedValue([...verified("a"), ...verified("b"), ...verified("c")]);
    masterJobs.cockpitFacts.mockResolvedValue([
      master("m1", { closingDate: "2026-11-20", estimatedDeparture: "2026-11-23" }),
      master("m3", { mczNumber: "MCZFCL00000031", estimatedDeparture: "2026-11-25", personInCharge: " eva@firma.cz " }),
      master("m2", { mczNumber: "MCZCONSOL00000020", estimatedDeparture: "2026-11-21", tradeDirection: "Import", holidayCover: "jan@firma.cz" }),
      // Leaves soon too, but has a shipment - one that is not among the jobs read (invoiced, or beyond the cap).
      master("m4", { mczNumber: "MCZCONSOL00000040", estimatedDeparture: "2026-11-21" }),
    ]);
    masterJobs.shipmentCounts.mockResolvedValue(new Map([["m4", 2]]));

    const out = await extraSignals(jobs, CTX);
    // Only the master jobs that are no house's of the jobs read are counted.
    expect(masterJobs.shipmentCounts).toHaveBeenCalledExactlyOnceWith(["m3", "m2", "m4"], COMPANY);
    expect(texts(out.byJob.get("a"))).toEqual(["Master Job MCZCONSOL00000012: Closing on Fri 20.11. · SI not confirmed, cargo not received"]);
    expect(out.byJob.has("b")).toBe(false);
    expect(out.byJob.has("c")).toBe(false);
    expect(out.masterJobRows).toEqual([
      {
        id: "m2",
        number: "MCZCONSOL00000020",
        customer: "Globex Ltd",
        signals: [{ rank: 36, text: "No shipment linked · ETD on Sat 21.11.", urgent: false, area: "details", kind: "master_job" }],
        freightMode: "Sea Freight",
        tradeDirection: "Import",
        handledBy: "jan@firma.cz",
        holidayCover: "jan@firma.cz",
      },
      {
        id: "m3",
        number: "MCZFCL00000031",
        customer: "ACME s.r.o.",
        signals: [{ rank: 36, text: "No shipment linked · ETD on Wed 25.11.", urgent: false, area: "details", kind: "master_job" }],
        freightMode: "Sea Freight",
        tradeDirection: "Export",
        handledBy: "eva@firma.cz",
        holidayCover: "",
      },
    ]);
  });

  it("still looks for Master Jobs with no shipment when there is no job at all", async () => {
    masterJobs.cockpitFacts.mockResolvedValue([master("m9", { estimatedDeparture: "2026-11-19", shipper: "", consignee: "" })]);
    const out = await extraSignals([], CTX);
    expect(masterJobs.cockpitFacts).toHaveBeenCalledExactlyOnceWith(COMPANY, [], "2026-11-18", "2026-12-02");
    expect(out.masterJobRows.map((r) => [r.number, r.customer, texts(r.signals)])).toEqual([["MCZCONSOL00000012", "", ["No shipment linked · ETD tomorrow"]]]);
    expect(out.byJob.size).toBe(0);
  });

  it("reads the B/L dates off the job's row (step 6): an original in hand clears its tag, a delivery order missing after the arrival is one", async () => {
    attachments.reviewFactsByShipmentIds.mockResolvedValue([...verified("a"), ...verified("b"), ...verified("c")]);
    const jobs = [
      job("a", { masterBolType: "OBL", estimatedArrival: "2026-11-19", originalsReceivedDate: "2026-11-16", telexReleaseReceivedDate: null, deliveryOrderDate: null }),
      job("b", { actualArrival: "2026-11-12", originalsReceivedDate: null, telexReleaseReceivedDate: null, deliveryOrderDate: null }),
      job("c", { actualArrival: "2026-11-12", originalsReceivedDate: null, telexReleaseReceivedDate: null, deliveryOrderDate: "2026-11-13" }),
    ];
    const out = await extraSignals(jobs, CTX);
    expect(out.byJob.get("a")).toBeUndefined();
    // Arrived before the delivery order rule went live (DELIVERY_ORDER_RULE_FROM, L9): no tag.
    expect(out.byJob.get("b")).toBeUndefined();
    expect(out.byJob.get("c")).toBeUndefined();
    // A week on (Wed 25 Nov), an arrival of Thu 19 Nov - the rule's first day - is one.
    const later = { ...CTX, now: at("2026-11-25 10:00"), today: "2026-11-25" };
    const arrived = (over = {}) => job("b", { actualArrival: "2026-11-19", originalsReceivedDate: null, telexReleaseReceivedDate: null, deliveryOrderDate: null, ...over });
    expect((await extraSignals([arrived()], later)).byJob.get("b")).toEqual([{ rank: 4.5, text: "Arrived 19.11., no delivery order", urgent: true, area: "details", kind: "bl" }]);
    // With the 20th, 23rd and 24th off, only today has passed since the ATA: ATTENTION.
    expect((await extraSignals([arrived()], { ...later, holidays: ["2026-11-20", "2026-11-23", "2026-11-24"] })).byJob.get("b")?.map((s) => s.urgent)).toEqual([false]);
    // In our warehouse (m25): an LCL import we collected and devanned had its delivery order handled.
    expect((await extraSignals([arrived({ warehouseReceivedDate: "2026-11-20" })], later)).byJob.get("b")).toBeUndefined();
  });

  it("hands the company's own days off to the rules", async () => {
    attachments.reviewFactsByShipmentIds.mockResolvedValue(verified("a"));
    documentRequests.waitingByShipmentIds.mockResolvedValue([{ shipmentId: "a", requestedAt: at("2026-11-16 09:00") }]);
    expect((await extraSignals([job("a")], CTX)).byJob.has("a")).toBe(true);
    // With the 18th off, Monday's request has not waited a working day yet.
    expect((await extraSignals([job("a")], { ...CTX, holidays: ["2026-11-18"] })).byJob.has("a")).toBe(false);
  });
});

describe("a part that cannot be read", () => {
  // An import every part but the Master Jobs has something to say about, and an export house for those.
  const busy = job("a", {
    estimatedArrival: "2026-11-19",
    masterBolType: "OBL",
    dangerous: "Yes",
    closingDate: "2026-11-20",
    status: "Delivery Date Pending From Customer [IMP]",
    createdAt: at("2026-11-02 09:00"),
    customsPriority: "Urgent",
  });
  const house = job("h", { tradeDirection: "Export", masterJobId: "m1", shippingInstructions: "Not Queried" });
  const JOBS = [busy, house];
  const fill = () => {
    attachments.reviewFactsByShipmentIds.mockResolvedValue([file("a", "Invoice", "", { createdAt: at("2026-11-12 10:00") })]);
    documentRequests.waitingByShipmentIds.mockResolvedValue([{ shipmentId: "a", requestedAt: at("2026-11-18 09:00") }]);
    forms.liveByShipmentIds.mockResolvedValue([{ shipmentId: "a", status: "open", submittedAt: null, expiresAt: at("2026-11-27 14:00") }]);
    audit.latestByShipmentIds.mockImplementation(history([change("a", "status", "2026-11-05 09:00"), change("a", "remeasurementAccepted", "2026-11-12 09:00")]));
    masterJobs.cockpitFacts.mockResolvedValue([master("m1", { closingDate: "2026-11-20" }), master("m2", { mczNumber: "MCZFCL00000002", estimatedDeparture: "2026-11-20" })]);
  };
  const ALL = [
    "Master BoL is an OBL, not in hand · arriving tomorrow",
    "Waiting For Commercial Paperwork · arriving tomorrow",
    "Commercial Invoice not reviewed by customs since 12.11. 10:00",
    "Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing on Fri 20.11.",
    "Customs Urgent with no deadline typed",
    "Document change waiting for approval since 18.11. 09:00",
    "Import Instructions not filled in by the customer · arriving tomorrow",
    "Remeasurement accepted 12.11., costs not checked",
    "Status unchanged since 05.11.",
  ];
  const HOUSE = ["Master Job MCZCONSOL00000012: Closing on Fri 20.11. · SI not confirmed, cargo not received"];

  beforeEach(fill);

  it("has, with every part read, a signal from each", async () => {
    const out = await extraSignals(JOBS, CTX);
    expect(out.notKnown).toEqual([]);
    expect(texts(out.byJob.get("a"))).toEqual(ALL);
    expect(texts(out.byJob.get("h"))).toEqual(HOUSE);
    expect(out.masterJobRows.map((r) => r.number)).toEqual(["MCZFCL00000002"]);
  });

  /** A part, how it fails, what the page is told is not known, and the tags that go with it. */
  const failing: [string, () => void, string[], string[]][] = [
    [
      EXTRA_PARTS.documents,
      () => attachments.reviewFactsByShipmentIds.mockRejectedValue(new Error("no documents")),
      ["documents"],
      // The customs status the shipment shows is read off its documents: nothing that needs it is said.
      ["Waiting For Commercial Paperwork · arriving tomorrow", "Commercial Invoice not reviewed by customs since 12.11. 10:00", "Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing on Fri 20.11."],
    ],
    [EXTRA_PARTS.requests, () => officeRequests.waitingByShipmentIds.mockRejectedValue(new Error("no requests")), ["requests waiting for a manager"], ["Document change waiting for approval since 18.11. 09:00"]],
    [EXTRA_PARTS.importInstructions, () => forms.liveByShipmentIds.mockRejectedValue(new Error("no forms")), ["Import Instructions"], ["Import Instructions not filled in by the customer · arriving tomorrow"]],
    [
      // The history is one read for its two parts: neither is known without it. The status is not
      // aged by the job's creation instead - the history was not read, so it is not known to be empty.
      `${EXTRA_PARTS.remeasurements}, ${EXTRA_PARTS.statusAges}`,
      () => audit.latestByShipmentIds.mockRejectedValue(new Error("no history")),
      ["remeasurements", "how long a status has stood"],
      ["Remeasurement accepted 12.11., costs not checked", "Status unchanged since 05.11."],
    ],
    [EXTRA_PARTS.masterJobs, () => masterJobs.cockpitFacts.mockRejectedValue(new Error("no master jobs")), ["Master Jobs"], HOUSE],
  ];

  it.each(failing)("names \"%s\" and says nothing of it, while the others still answer", async (name, fail, notKnown, lost) => {
    fail();
    const out = await extraSignals(JOBS, CTX);
    expect(out.notKnown).toEqual(notKnown);
    expect(texts(out.byJob.get("a"))).toEqual(ALL.filter((t) => !lost.includes(t)));
    expect(texts(out.byJob.get("h"))).toEqual(HOUSE.filter((t) => !lost.includes(t)));
    expect(out.masterJobRows.map((r) => r.number)).toEqual(name === EXTRA_PARTS.masterJobs ? [] : ["MCZFCL00000002"]);
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(expect.any(Error), "a part of Shipments → Managers could not be read", { part: name });
  });

  it("names the Master Jobs too when only their shipments could not be counted", async () => {
    masterJobs.shipmentCounts.mockRejectedValue(new Error("no count"));
    const out = await extraSignals(JOBS, CTX);
    expect(out.notKnown).toEqual(["Master Jobs"]);
    expect(out.masterJobRows).toEqual([]);
    expect(out.byJob.has("h")).toBe(false);
    expect(texts(out.byJob.get("a"))).toEqual(ALL);
  });

  it("names every part that failed, in the parts' own order, and never throws", async () => {
    masterJobs.cockpitFacts.mockRejectedValue(new Error("x"));
    attachments.reviewFactsByShipmentIds.mockRejectedValue(new Error("x"));
    documentRequests.waitingByShipmentIds.mockRejectedValue(new Error("x"));
    forms.liveByShipmentIds.mockRejectedValue(new Error("x"));
    audit.latestByShipmentIds.mockRejectedValue(new Error("x"));
    const out = await extraSignals(JOBS, CTX);
    expect(out.notKnown).toEqual(["documents", "requests waiting for a manager", "Import Instructions", "remeasurements", "how long a status has stood", "Master Jobs"]);
    // What the job's own columns say needs no other table.
    expect(texts(out.byJob.get("a"))).toEqual(["Master BoL is an OBL, not in hand · arriving tomorrow", "Customs Urgent with no deadline typed"]);
    expect(out.byJob.has("h")).toBe(false);
    expect(out.masterJobRows).toEqual([]);
  });
});
