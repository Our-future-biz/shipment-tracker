import { beforeEach, describe, expect, it, vi } from "vitest";

const tasks = vi.hoisted(() => ({
  findForShipment: vi.fn(),
  ensureForShipment: vi.fn(),
  softDeleteForShipment: vi.fn(),
}));
const sections = vi.hoisted(() => ({ findByShipmentAndSection: vi.fn(), upsert: vi.fn(), softDeleteForShipment: vi.fn() }));
const shipments = vi.hoisted(() => ({ assertShipmentExists: vi.fn() }));
vi.mock("../repositories/warehouseTask.repository", () => ({ warehouseTaskRepository: tasks }));
vi.mock("../repositories/warehouseSection.repository", () => ({ warehouseSectionRepository: sections }));
vi.mock("../../../lib/shipmentRefs", () => shipments);
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (m: string) => new Error(m), notFound: (m: string) => new Error(m) } }));

import { taskChanges, toSection, warehouseService } from "../services/warehouse.service";

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
    await expect(warehouseService.upsertSection(SHIPMENT, "job", COMPANY, {})).rejects.toThrow("Shipment not found");
    expect(sections.upsert).not.toHaveBeenCalled();
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
