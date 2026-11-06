import { beforeEach, describe, expect, it, vi } from "vitest";

const tasks = vi.hoisted(() => ({
  findForShipment: vi.fn(),
  ensureForShipment: vi.fn(),
  softDeleteForShipment: vi.fn(),
}));
const sections = vi.hoisted(() => ({ findManyBySection: vi.fn(), findByShipmentAndSection: vi.fn(), upsert: vi.fn(),softDeleteForShipment: vi.fn(), patchKeys: vi.fn() }));
const shipments = vi.hoisted(() => ({ assertShipmentExists: vi.fn() }));
const notice = vi.hoisted(() => ({ tellOperations: vi.fn() }));
vi.mock("../repositories/warehouseTask.repository", () => ({ warehouseTaskRepository: tasks }));
vi.mock("../repositories/warehouseSection.repository", () => ({ warehouseSectionRepository: sections }));
vi.mock("../../../lib/shipmentRefs", () => shipments);
vi.mock("../../../lib/operationsNotice", () => notice);
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its code and message here.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { pickupLicensePlates, remeasuredFigures, taskChanges, toSection, warehouseService } from "../services/warehouse.service";

const COMPANY = "c1";
const SHIPMENT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => vi.clearAllMocks());

describe("warehouse sections", () => {
  it("accepts only the known sections, without echoing what was sent", () => {
    expect(toSection("customs")).toBe("customs");
    expect(() => toSection("<script>")).toThrow("Unknown section; use one of: job, customs, pickup, invoicing");
  });

  it("checks the shipment before its first section is saved", async () => {
    sections.findByShipmentAndSection.mockResolvedValue(null);
    shipments.assertShipmentExists.mockRejectedValueOnce(new Error("Shipment not found"));
    await expect(warehouseService.upsertSection(SHIPMENT, "pickup", COMPANY, {})).rejects.toThrow("Shipment not found");
    expect(sections.upsert).not.toHaveBeenCalled();
    shipments.assertShipmentExists.mockRejectedValueOnce(new Error("Shipment not found"));
    await expect(warehouseService.patchSection(SHIPMENT, "job", COMPANY, [{ key: "notes", value: "x", expected: "" }])).rejects.toThrow("Shipment not found");
    expect(sections.patchKeys).not.toHaveBeenCalled();
  });
});

describe("Pick-up license plates", () => {
  const rows = (...plates: string[]) => JSON.stringify(plates.map((licensePlate) => ({ haulier: "H", licensePlate, driver: "D" })));

  it("reads the plate of the rows as they are stored", () => {
    expect(pickupLicensePlates({ pin: "1234", rows: rows("1AB 2345") })).toBe("1AB 2345");
  });

  it("lists every plate of several rows once, without blanks", () => {
    expect(pickupLicensePlates({ rows: rows(" 1AB 2345 ", "", "3CD 4567", "1AB 2345") })).toBe("1AB 2345, 3CD 4567");
  });

  it("is empty with no rows or with rows that cannot be read", () => {
    for (const data of [null, undefined, "x", {}, { rows: "" }, { rows: "not json" }, { rows: "{}" }, { rows: "[null, 5]" }, { rows: rows("") }]) {
      expect(pickupLicensePlates(data)).toBe("");
    }
  });

  it("answers only the shipments that have a plate", async () => {
    sections.findManyBySection.mockResolvedValue([
      { shipmentId: "a", data: { rows: rows("1AB 2345") } },
      { shipmentId: "b", data: { pin: "1234", rows: "[]" } },
    ]);
    await expect(warehouseService.pickupPlates(["a", "b"], COMPANY)).resolves.toEqual([{ shipmentId: "a", licensePlate: "1AB 2345" }]);
    expect(sections.findManyBySection).toHaveBeenCalledWith(["a", "b"], "pickup", COMPANY);
  });

  it("does not query for an empty page", async () => {
    await expect(warehouseService.pickupPlates([], COMPANY)).resolves.toEqual([]);
    expect(sections.findManyBySection).not.toHaveBeenCalled();
  });
});

describe("Shipment Details saved field by field", () => {
  const row = (data: Record<string, unknown>) => ({ id: "w1", shipmentId: SHIPMENT, section: "job", data, createdAt: new Date(), updatedAt: new Date() });

  it("refuses a whole save of Shipment Details: one from a page opened before would take back what was saved since", async () => {
    await expect(warehouseService.upsertSection(SHIPMENT, "job", COMPANY, { notes: "x" })).rejects.toThrow(/saved field by field/);
    expect(sections.upsert).not.toHaveBeenCalled();
  });

  it("writes only the fields sent, and refuses one changed meanwhile naming it", async () => {
    sections.findByShipmentAndSection.mockResolvedValue(row({}));
    sections.patchKeys.mockResolvedValueOnce({ row: row({ notes: "fragile" }), conflicts: null });
    const saved = await warehouseService.patchSection(SHIPMENT, "job", COMPANY, [{ key: "notes", value: "fragile", expected: "" }]);
    expect(sections.patchKeys).toHaveBeenCalledWith(SHIPMENT, "job", COMPANY, [{ key: "notes", value: "fragile", expected: "" }]);
    expect(saved.data).toEqual({ notes: "fragile" });
    sections.patchKeys.mockResolvedValueOnce({ row: null, conflicts: ["remeasure_rows"] });
    await expect(warehouseService.patchSection(SHIPMENT, "job", COMPANY, [{ key: "remeasure_rows", value: "[]", expected: "" }])).rejects.toThrow(
      expect.objectContaining({ code: "aborted", message: expect.stringMatching(/^Changed meanwhile: remeasured lines/) }),
    );
  });

  it("takes only its fields - when Operations were informed is written by Inform Operations alone - and lines as a list", async () => {
    const bad = [
      [{ key: "inform_operations_sent", value: "2026-11-05T10:00:00Z", expected: "" }],
      [{ key: "remeasure_rows", value: "{}", expected: "" }],
      [{ key: "notes", value: "a" }, { key: "notes", value: "b" }],
      [],
    ];
    for (const changes of bad) await expect(warehouseService.patchSection(SHIPMENT, "job", COMPANY, changes)).rejects.toThrow(expect.objectContaining({ code: "invalid_argument" }));
    await expect(warehouseService.patchSection(SHIPMENT, "pickup", COMPANY, [{ key: "rows", value: "[]" }])).rejects.toThrow(/saved whole/);
    expect(sections.patchKeys).not.toHaveBeenCalled();
  });
});

describe("Inform Operations", () => {
  const LINES = JSON.stringify([{ pieces: "11", lengthCm: "120", widthCm: "80", heightCm: "150", weightPerPcKg: "250" }]);
  // The repository runs the notice inside its transaction, on the section as saved.
  const savedWith = (data: Record<string, unknown>) =>
    sections.patchKeys.mockImplementationOnce(async (_s, _sec, _c, changes, after) => {
      const row = { id: "w1", shipmentId: SHIPMENT, section: "job", data: { ...data, inform_operations_sent: changes[0].value }, createdAt: new Date(), updatedAt: new Date() };
      await after(undefined, row);
      return { row, conflicts: null };
    });

  it("records the time and tells the shipment's people the saved figures, compared with its dimension lines; answers who was tagged", async () => {
    savedWith({ remeasure_rows: LINES });
    notice.tellOperations.mockResolvedValueOnce(["pic@firma.cz"]);
    const res = await warehouseService.informOperations(SHIPMENT, COMPANY, "");
    expect(sections.patchKeys).toHaveBeenCalledWith(SHIPMENT, "job", COMPANY, [{ key: "inform_operations_sent", value: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), expected: "" }], expect.any(Function));
    expect(notice.tellOperations).toHaveBeenCalledWith(SHIPMENT, { colli: 11, weightKg: 2750, volumeCbm: 15.84 }, "dimensions");
    expect(res.tagged).toEqual(["pic@firma.cz"]);
  });

  it("fails - so nothing is recorded - when no lines are saved or the notice cannot be posted", async () => {
    savedWith({});
    await expect(warehouseService.informOperations(SHIPMENT, COMPANY, "")).rejects.toThrow(expect.objectContaining({ code: "failed_precondition" }));
    savedWith({ remeasure_rows: LINES });
    notice.tellOperations.mockRejectedValueOnce(new Error("chat down"));
    await expect(warehouseService.informOperations(SHIPMENT, COMPANY, "")).rejects.toThrow("chat down");
  });

  it("refuses a second click of a double click: the time it saw changed meanwhile", async () => {
    sections.patchKeys.mockResolvedValueOnce({ row: null, conflicts: ["inform_operations_sent"] });
    await expect(warehouseService.informOperations(SHIPMENT, COMPANY, "")).rejects.toThrow(expect.objectContaining({ code: "aborted", message: expect.stringContaining("operations informed") }));
    expect(notice.tellOperations).not.toHaveBeenCalled();
  });
});

describe("remeasuredFigures", () => {
  it("adds up the saved lines as Shipments → Warehouse shows them; nothing readable is nothing", () => {
    const lines = JSON.stringify([
      { pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "250.5" },
      { pieces: "3", lengthCm: "", widthCm: "50", heightCm: "50", weightPerPcKg: "10" },
    ]);
    expect(remeasuredFigures(lines)).toEqual({ colli: 5, weightKg: 531, volumeCbm: 1.92 });
    expect(remeasuredFigures("not json")).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
    expect(remeasuredFigures(undefined)).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
  });
});

describe("taskChanges", () => {
  it("turns a blank due date into none and refuses one that isn't a date", () => {
    expect(taskChanges({ dueDate: "" })).toEqual({ dueDate: null });
    expect(taskChanges({ dueDate: "2026-11-20", notes: undefined })).toEqual({ dueDate: "2026-11-20" });
    expect(() => taskChanges({ dueDate: "next week" })).toThrow("dueDate must be a date");
  });
});

describe("ensureForShipments", () => {
  it("only checks shipments that don't have a reference yet", async () => {
    tasks.findForShipment.mockImplementation(async (_c: string, id: string) => (id === "a" ? { taskId: "WHCZ2026001" } : null));
    tasks.ensureForShipment.mockResolvedValue({ taskId: "WHCZ2026002" });
    const refs = await warehouseService.ensureForShipments(COMPANY, ["a", "b", "a"], new Date("2026-05-01"));
    expect(refs).toEqual([
      { shipmentId: "a", reference: "WHCZ2026001" },
      { shipmentId: "b", reference: "WHCZ2026002" },
    ]);
    expect(shipments.assertShipmentExists).toHaveBeenCalledTimes(1);
    expect(shipments.assertShipmentExists).toHaveBeenCalledWith("b");
  });
});

describe("retireShipment", () => {
  it("soft-deletes the shipment's task and sections", async () => {
    await warehouseService.retireShipment(SHIPMENT, COMPANY);
    expect(tasks.softDeleteForShipment).toHaveBeenCalledWith(SHIPMENT, COMPANY);
    expect(sections.softDeleteForShipment).toHaveBeenCalledWith(SHIPMENT, COMPANY);
  });
});
