import { beforeEach, describe, expect, it, vi } from "vitest";

const attachments = vi.hoisted(() => ({ customsVerdictsFor: vi.fn() }));
const lookup = vi.hoisted(() => ({ userEmailOf: vi.fn(), companyUsers: vi.fn() }));
const audit = vi.hoisted(() => ({ listByShipmentId: vi.fn() }));
const shipments = vi.hoisted(() => ({ requireLive: vi.fn(), get: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../../../lib/companyUsers", () => lookup);
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map([["r1", "customs@firma.cz"]]) }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: attachments }));
vi.mock("../../repositories/shipmentAlertRead.repository", () => ({ shipmentAlertReadRepository: {} }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: audit }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: shipments }));

import { alertService } from "../../services/alert.service";

const row = (over = {}) => ({
  id: "d1",
  shipmentId: "s1",
  jobNumber: "CZ1",
  fileName: "invoice.pdf",
  documentType: "Commercial Invoice",
  status: "declined",
  note: "Wrong value",
  reviewedAt: new Date("2026-11-06T10:00:00Z"),
  reviewedById: "r1",
  readAt: null as Date | null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  lookup.userEmailOf.mockResolvedValue(" Eva@Firma.cz ");
  attachments.customsVerdictsFor.mockResolvedValue([row()]);
});

describe("customs' verdicts under the bell", () => {
  const NOW = Date.parse("2026-11-06T12:00:00Z");

  it("looks up this user's shipments by their e-mail, 30 days back and 7 for what they have read", async () => {
    await alertService.customsVerdicts("c1", "u1", NOW);
    expect(attachments.customsVerdictsFor).toHaveBeenCalledWith("c1", "u1", "eva@firma.cz", new Date("2026-10-07T12:00:00Z"), new Date("2026-10-30T12:00:00Z"), 100);
  });

  it("says who reviewed what, with the reason of a decline", async () => {
    expect(await alertService.customsVerdicts("c1", "u1", NOW)).toEqual([
      {
        id: "d1",
        shipmentId: "s1",
        jobNumber: "CZ1",
        fileName: "invoice.pdf",
        documentType: "Commercial Invoice",
        status: "declined",
        note: "Wrong value",
        reviewedAt: "2026-11-06T10:00:00.000Z",
        reviewedByName: "customs@firma.cz",
        unread: true,
      },
    ]);
  });

  it("is new until the shipment's Alerts were opened after it", async () => {
    const at = (readAt: string) => row({ readAt: new Date(readAt) });
    attachments.customsVerdictsFor.mockResolvedValue([at("2026-11-06T09:00:00Z"), at("2026-11-06T11:00:00Z")]);
    expect((await alertService.customsVerdicts("c1", "u1", NOW)).map((v) => v.unread)).toEqual([true, false]);
  });

  it("tells an approval too", async () => {
    attachments.customsVerdictsFor.mockResolvedValue([row({ status: "approved", note: "" })]);
    expect((await alertService.customsVerdicts("c1", "u1", NOW))[0]?.status).toBe("approved");
  });

  it("has nothing for a user whose e-mail can't be looked up", async () => {
    lookup.userEmailOf.mockResolvedValue("");
    expect(await alertService.customsVerdicts("c1", "u1", NOW)).toEqual([]);
    expect(attachments.customsVerdictsFor).not.toHaveBeenCalled();
  });
});

describe("the warehouse's Inform Operations on the Alerts tab", () => {
  const at = new Date("2026-11-18T09:05:00Z");
  const informed = (id: string, ours: object, found: object, comparedWith = "dimensions", source?: string) => ({
    id,
    userId: "u1",
    changedAt: at,
    oldValue: JSON.stringify(ours),
    newValue: JSON.stringify({ ...found, comparedWith, ...(source ? { source } : {}), commentId: "m1" }),
  });

  // The history as stored: the Inform Operations, and the acceptances on Cargo Details.
  const history = (informedRows: object[], acceptedRows: object[] = []) =>
    audit.listByShipmentId.mockImplementation(async (_s: string, _c: string, fields: string[]) => (fields[0] === "remeasureInformed" ? informedRows : acceptedRows));
  // The shipment as it is now: 1 piece of 300 kg, 0.96 m³ on its cargo line.
  const shipmentNow = (over = {}) =>
    shipments.get.mockResolvedValue({
      pcs: "1",
      totalWeightTons: "0.3",
      totalVolumeCbm: "0.96",
      cargoDimensions: [{ pieces: "1", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "300", volumePerPcM3: "" }],
      ...over,
    });
  beforeEach(() => shipmentNow());

  it("lists each with how its figures stand, by whom, the newest first as stored", async () => {
    lookup.companyUsers.mockResolvedValue([{ id: "u1", email: "petr@firma.cz", displayName: "Petr" }]);
    history([
      informed("a2", { colli: 1, weightKg: 300, volumeCbm: 0.96 }, { colli: 1, weightKg: 500, volumeCbm: 6.292 }),
      informed("a1", { colli: 1, weightKg: 300, volumeCbm: 0.96 }, { colli: 1, weightKg: 300, volumeCbm: 0.96 }, "declared", "warehouseConcept"),
    ]);
    const list = await alertService.remeasureInformed("s1", "c1");
    expect(shipments.requireLive).toHaveBeenCalledWith("s1", "c1");
    expect(audit.listByShipmentId).toHaveBeenCalledWith("s1", "c1", ["remeasureInformed"], 50);
    expect(list).toEqual([
      {
        id: "a2",
        informedAt: at.toISOString(),
        informedBy: "Petr",
        shipment: { colli: 1, weightKg: 300, volumeCbm: 0.96 },
        remeasured: { colli: 1, weightKg: 500, volumeCbm: 6.292 },
        comparedWith: "dimensions",
        // A record that names no warehouse is the Warehouse's.
        source: "warehouse",
        verdict: "differs",
        difference: "weight +200.0 kg · volume +5.332 CBM",
        acceptedAt: null,
        acceptedBy: "",
        nowMatches: false,
      },
      expect.objectContaining({ id: "a1", comparedWith: "declared", source: "warehouseConcept", verdict: "matches", difference: "" }),
    ]);
  });

  it("still lists them when the users can't be read, without a name", async () => {
    lookup.companyUsers.mockRejectedValue(new Error("auth down"));
    history([informed("a1", { colli: 1, weightKg: 0, volumeCbm: 0 }, { colli: 2, weightKg: 0, volumeCbm: 0 })]);
    expect(await alertService.remeasureInformed("s1", "c1")).toMatchObject([{ informedBy: "", verdict: "differs", difference: "colli +1" }]);
  });

  it("says who accepted the remeasured figures after the warehouse informed, an earlier acceptance or other figures not", async () => {
    lookup.companyUsers.mockResolvedValue([{ id: "u2", email: "jana@firma.cz", displayName: "Jana" }]);
    const found = { colli: 1, weightKg: 500, volumeCbm: 6.292 };
    const acceptance = (id: string, changedAt: string, after: object) => ({ id, userId: "u2", changedAt: new Date(changedAt), oldValue: "{}", newValue: JSON.stringify({ ...after, lines: "[]" }) });
    history([informed("a1", { colli: 1, weightKg: 300, volumeCbm: 0.96 }, found)], [
      acceptance("x3", "2026-11-18T12:00:00Z", found),
      acceptance("x2", "2026-11-18T10:00:00Z", { ...found, weightKg: 480 }),
      acceptance("x1", "2026-11-17T10:00:00Z", found),
    ]);
    const [item] = await alertService.remeasureInformed("s1", "c1");
    expect(item).toMatchObject({ verdict: "differs", acceptedAt: "2026-11-18T12:00:00.000Z", acceptedBy: "Jana" });
  });

  it("knows when Cargo Details matches the remeasured figures now - its lines, a figure they lack from its totals", async () => {
    history([informed("a1", { colli: 1, weightKg: 300, volumeCbm: 0.96 }, { colli: 1, weightKg: 500, volumeCbm: 0.96 })]);
    shipmentNow({ totalWeightTons: "0.5", cargoDimensions: [{ pieces: "1", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "", volumePerPcM3: "" }] });
    expect(await alertService.remeasureInformed("s1", "c1")).toMatchObject([{ verdict: "differs", acceptedAt: null, nowMatches: true }]);
  });

  it("holds Warehouse Concept's remeasurement to its 5 % tolerance: within it, no alert", async () => {
    history([
      informed("a2", { colli: 10, weightKg: 1000, volumeCbm: 2 }, { colli: 10, weightKg: 1060, volumeCbm: 2 }, "declared", "warehouseConcept"),
      informed("a1", { colli: 10, weightKg: 1000, volumeCbm: 2 }, { colli: 10, weightKg: 1040, volumeCbm: 2 }, "declared", "warehouseConcept"),
    ]);
    expect((await alertService.remeasureInformed("s1", "c1")).map((i) => i.verdict)).toEqual(["differs", "matches"]);
  });
});
