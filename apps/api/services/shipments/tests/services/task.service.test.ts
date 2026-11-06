import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain tick of the checklist, run against stand-ins for the repositories.
const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const tasks = vi.hoisted(() => ({ upsert: vi.fn(), reopen: vi.fn(), listByShipmentId: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentTask.repository", () => ({ shipmentTaskRepository: tasks }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: { create: vi.fn() } }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: { requireLive: vi.fn() } }));

import { taskService } from "../../services/task.service";

const sea = { id: "s1", tradeDirection: "Import", freightMode: "Sea Freight", department: "" };
const tick = (taskKey: string) => taskService.upsert("s1", "c1", taskKey, true, "u1");

beforeEach(() => {
  vi.clearAllMocks();
  shipments.getByIdForCompany.mockResolvedValue(sea);
  tasks.upsert.mockImplementation(async (shipmentId: string, _companyId: string, taskKey: string, completed: boolean, completedById: string) => ({
    id: "t1",
    shipmentId,
    taskKey,
    completed,
    completedAt: new Date("2026-11-06T10:00:00Z"),
    completedById,
  }));
});

describe("a plain tick", () => {
  it("is written for a task that is only a tick", async () => {
    await expect(tick("imp_booking_confirmed")).resolves.toMatchObject({ taskKey: "imp_booking_confirmed", completed: true });
    expect(tasks.upsert).toHaveBeenCalledWith("s1", "c1", "imp_booking_confirmed", true, "u1");
  });

  it("is refused for a dated tick, which comes with its event on the Tracking tab", async () => {
    await expect(tick("imp_cargo_shipped")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("on the Tracking tab") });
    await expect(tick("imp_delivered")).rejects.toMatchObject({ code: "failed_precondition" });
    expect(tasks.upsert).not.toHaveBeenCalled();
  });

  it("is refused for a tick the notice to the customer writes, and for Billed", async () => {
    await expect(tick("imp_arrival_notice")).rejects.toThrow("Tell the customer");
    await expect(tick("exp_billed")).rejects.toThrow("invoiced");
    expect(tasks.upsert).not.toHaveBeenCalled();
  });

  it("stays for a Trucking job's dated ticks, which record nothing here, but not for Delivered", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...sea, tradeDirection: "Domestic", freightMode: "Road Freight" });
    await expect(tick("imp_cargo_readiness")).resolves.toMatchObject({ completed: true });
    await expect(tick("imp_delivered")).rejects.toThrow("delivery date");
  });

  it("is not found on a shipment that isn't live in the company", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(tick("imp_booking_confirmed")).rejects.toThrow("Shipment not found");
    expect(tasks.upsert).not.toHaveBeenCalled();
  });
});
