import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit test of warehouse.service (main's test, adapted to the position-based warehouse): the
// repositories, the gate admin service and the shipments check are mocked, so no database runs.
const tasks = vi.hoisted(() => ({ findLiveForShipment: vi.fn(), listByShipmentId: vi.fn(), update: vi.fn() }));
const sections = vi.hoisted(() => ({
  findPickup: vi.fn(),
  findByTask: vi.fn(),
  findAdoptable: vi.fn(),
  upsertPickupRows: vi.fn(),
  patchKeys: vi.fn(),
  softDeleteForShipment: vi.fn(),
}));
const gateAdmin = vi.hoisted(() => ({ retireForDeletedShipment: vi.fn() }));
const shipments = vi.hoisted(() => ({ assertShipmentExists: vi.fn() }));
vi.mock("../repositories/warehouseTask.repository", () => ({ warehouseTaskRepository: tasks }));
vi.mock("../repositories/warehouseSection.repository", () => ({ warehouseSectionRepository: sections }));
vi.mock("../repositories/gateMovement.repository", () => ({ gateMovementRepository: {} }));
vi.mock("../repositories/reweigh.repository", () => ({ reweighRepository: {} }));
vi.mock("../services/gateAdmin.service", () => ({ gateAdminService: gateAdmin }));
vi.mock("../services/users", () => ({ userName: async () => "" }));
vi.mock("../../../lib/shipmentRefs", () => shipments);
// The Encore runtime isn't needed here; APIError only needs to carry its message.
vi.mock("encore.dev/api", () => {
  const err = (m: string) => new Error(m);
  return { APIError: { invalidArgument: err, notFound: err, aborted: err, failedPrecondition: err } };
});

import { taskChanges, toSection, warehouseService } from "../services/warehouse.service";

const COMPANY = "c1";
const SHIPMENT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => vi.clearAllMocks());

describe("warehouse sections", () => {
  it("accepts only the known sections, without echoing what was sent", () => {
    expect(toSection("customs")).toBe("customs");
    expect(() => toSection("<script>")).toThrow("Unknown section; use one of: job, customs, pickup, invoicing");
  });

  it("checks the shipment before its first pick-up save", async () => {
    sections.findPickup.mockResolvedValue(null);
    shipments.assertShipmentExists.mockRejectedValueOnce(new Error("Shipment not found"));
    await expect(warehouseService.upsertPickupRows(SHIPMENT, COMPANY, { rows: "[]" })).rejects.toThrow("Shipment not found");
    expect(sections.upsertPickupRows).not.toHaveBeenCalled();
  });

  it("does not check the shipment again once it has a pick-up row", async () => {
    sections.findPickup.mockResolvedValue({ id: "p1" });
    sections.upsertPickupRows.mockResolvedValue({ id: "p1" });
    await warehouseService.upsertPickupRows(SHIPMENT, COMPANY, { rows: "[]" });
    expect(shipments.assertShipmentExists).not.toHaveBeenCalled();
    expect(sections.upsertPickupRows).toHaveBeenCalledWith(SHIPMENT, COMPANY, []);
  });

  it("answers a shipment id that is not a uuid without reaching the database", async () => {
    expect(await warehouseService.getSection("not-a-uuid", "job", COMPANY)).toBeNull();
    expect(await warehouseService.getSection("not-a-uuid", "pickup", COMPANY)).toBeNull();
    expect(await warehouseService.listByShipmentId("not-a-uuid", COMPANY)).toEqual([]);
    await expect(warehouseService.upsertPickupRows("not-a-uuid", COMPANY, { rows: "[]" })).rejects.toThrow("Not a shipment id");
    await expect(
      warehouseService.patchSection("not-a-uuid", "job", COMPANY, [{ key: "notes", value: "x", expected: "" }]),
    ).rejects.toThrow("Not a shipment id");
    expect(sections.findPickup).not.toHaveBeenCalled();
    expect(sections.findAdoptable).not.toHaveBeenCalled();
    expect(sections.patchKeys).not.toHaveBeenCalled();
    expect(tasks.findLiveForShipment).not.toHaveBeenCalled();
    expect(tasks.listByShipmentId).not.toHaveBeenCalled();
  });
});

describe("taskChanges", () => {
  it("turns a blank due date into none and refuses one that isn't a date", () => {
    expect(taskChanges({ dueDate: "" })).toEqual({ dueDate: null });
    expect(taskChanges({ dueDate: "2026-11-20", notes: undefined })).toEqual({ dueDate: "2026-11-20" });
    expect(() => taskChanges({ dueDate: "next week" })).toThrow("dueDate must be a date");
  });

  it("answers not found for an unknown task", async () => {
    tasks.update.mockResolvedValue(null);
    await expect(warehouseService.update(SHIPMENT, COMPANY, { notes: "x" })).rejects.toThrow("Warehouse task not found");
    await expect(warehouseService.update("WCZ2026000001", COMPANY, { notes: "x" })).rejects.toThrow("Warehouse task not found");
    expect(tasks.update).toHaveBeenCalledTimes(1);
  });
});

describe("retireShipment", () => {
  it("removes the shipment's positions through the gate admin flow and retires its sections when none is kept", async () => {
    gateAdmin.retireForDeletedShipment.mockResolvedValue({ removed: ["t0"], kept: [] });
    await warehouseService.retireShipment(SHIPMENT, COMPANY);
    expect(gateAdmin.retireForDeletedShipment).toHaveBeenCalledWith(SHIPMENT, COMPANY);
    expect(sections.softDeleteForShipment).toHaveBeenCalledWith(SHIPMENT, COMPANY);
  });

  it("keeps the shipment's pick-up and unowned sections while a stamped position is kept", async () => {
    gateAdmin.retireForDeletedShipment.mockResolvedValue({ removed: [], kept: ["t1"] });
    await warehouseService.retireShipment(SHIPMENT, COMPANY);
    expect(sections.softDeleteForShipment).not.toHaveBeenCalled();
  });

  it("ignores an id that is not a uuid", async () => {
    await warehouseService.retireShipment("not-a-uuid", COMPANY);
    expect(gateAdmin.retireForDeletedShipment).not.toHaveBeenCalled();
  });
});
