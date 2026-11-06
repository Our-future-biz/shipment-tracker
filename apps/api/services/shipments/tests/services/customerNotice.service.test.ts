import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const notices = vi.hoisted(() => ({ createForCompany: vi.fn() }));
const tasks = vi.hoisted(() => ({ upsert: vi.fn() }));
const customersClient = vi.hoisted(() => ({ _internalNoteFromShipment: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: customersClient }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: notices }));
vi.mock("../../repositories/shipmentTask.repository", () => ({ shipmentTaskRepository: tasks }));

import { customerNoticeService } from "../../services/customerNotice.service";

const shipment = { id: "s1", jobNumber: "CZ42", customerId: "cu1", estimatedArrival: "2026-10-09", etaWarehouse: null, plannedDeliveryDate: "2026-10-14" };
const record = (input: Partial<Parameters<typeof customerNoticeService.record>[3]> = {}) =>
  customerNoticeService.record("s1", "c1", "u1", { kind: "status", channel: "email", toldTo: " jana@alza.cz ", ...input });

beforeEach(() => {
  vi.clearAllMocks();
  shipments.getByIdForCompany.mockResolvedValue(shipment);
  notices.createForCompany.mockImplementation(async (_c: string, row: object) => ({ id: "n1", ...row }));
  customersClient._internalNoteFromShipment.mockResolvedValue(undefined);
});

describe("telling the customer", () => {
  it("keeps a copy of the dates as they stand, with who told them", async () => {
    await record();
    expect(notices.createForCompany).toHaveBeenCalledWith("c1", expect.objectContaining({ shipmentId: "s1", kind: "status", channel: "email", toldTo: "jana@alza.cz", etaPod: "2026-10-09", etaWarehouse: null, plannedDelivery: "2026-10-14", toldById: "u1" }));
  });

  it("refuses what isn't a shipment, a kind or a channel", async () => {
    shipments.getByIdForCompany.mockResolvedValueOnce(null);
    await expect(record()).rejects.toThrow("Shipment not found");
    await expect(record({ kind: "gossip" })).rejects.toThrow("no kind of notice");
    await expect(record({ channel: "pigeon" })).rejects.toThrow("how the customer was told");
    expect(notices.createForCompany).not.toHaveBeenCalled();
  });

  it("ticks the task it comes with, and only one that goes with it", async () => {
    await record({ kind: "arrival_notice", taskKey: "imp_arrival_notice" });
    expect(tasks.upsert).toHaveBeenCalledWith("s1", "c1", "imp_arrival_notice", true, "u1");
    await expect(record({ kind: "status", taskKey: "imp_arrival_notice" })).rejects.toThrow("doesn't go with");
  });

  it("logs an arrival notice, an ETA change and a POD with the customer", async () => {
    await record({ kind: "eta_change", channel: "phone" });
    expect(customersClient._internalNoteFromShipment).toHaveBeenCalledWith({ customerId: "cu1", type: "Call", content: expect.stringContaining("ETA change for job CZ42") });
  });

  it("doesn't bury sales' notes under plain status mails", async () => {
    await record({ kind: "status" });
    expect(customersClient._internalNoteFromShipment).not.toHaveBeenCalled();
  });

  it("logs nothing for a job with no customer", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, customerId: null });
    await record({ kind: "eta_change" });
    expect(customersClient._internalNoteFromShipment).not.toHaveBeenCalled();
  });

  it("keeps the notice when the Customer Database can't be reached", async () => {
    customersClient._internalNoteFromShipment.mockRejectedValue(new Error("away"));
    await expect(record({ kind: "eta_change" })).resolves.toMatchObject({ id: "n1" });
  });
});
