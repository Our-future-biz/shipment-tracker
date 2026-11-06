import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const auditRows = vi.hoisted(() => ({ listByShipmentId: vi.fn() }));
const taskRows = vi.hoisted(() => ({ listByShipmentId: vi.fn() }));
const service = vi.hoisted(() => ({ isInvoiced: vi.fn(), customsStatusOf: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map([["u1", "jana@firma.cz"]]) }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: auditRows }));
vi.mock("../../repositories/shipmentTask.repository", () => ({ shipmentTaskRepository: taskRows }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: service }));

import { TRACKING_AUDIT_FIELDS } from "../../lib/trackingTimeline";
import { TRACKING_CHANGES_LIMIT, trackingService } from "../../services/tracking.service";

const shipment = {
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "",
  pol: "",
  pod: "",
  destination: "",
  hub: "",
  customsStatus: "",
  customsDeadline: "",
  mrn: "",
  estimatedArrival: "2026-12-09",
};
const change = (id: number) => ({ id: `a${id}`, field: "vessel", oldValue: "", newValue: "X", changedAt: new Date("2026-11-01T10:00:00Z"), userId: "u1" });

beforeEach(() => {
  vi.clearAllMocks();
  shipments.getByIdForCompany.mockResolvedValue(shipment);
  auditRows.listByShipmentId.mockResolvedValue([]);
  taskRows.listByShipmentId.mockResolvedValue([]);
  service.isInvoiced.mockResolvedValue(false);
  service.customsStatusOf.mockResolvedValue("Waiting For Commercial Paperwork");
});

describe("the shipment's tracking", () => {
  it("is not found for a shipment that isn't live in this company", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(trackingService.get("s1", "c1")).rejects.toThrow("Shipment not found");
    expect(auditRows.listByShipmentId).not.toHaveBeenCalled();
  });

  it("reads the transport fields of this shipment and company, one row past the limit", async () => {
    await trackingService.get("s1", "c1");
    expect(auditRows.listByShipmentId).toHaveBeenCalledWith("s1", "c1", TRACKING_AUDIT_FIELDS, TRACKING_CHANGES_LIMIT + 1);
  });

  it("shows the customs status worked out from the paperwork", async () => {
    const t = await trackingService.get("s1", "c1");
    expect(service.customsStatusOf).toHaveBeenCalledWith(shipment, "c1");
    expect(t.milestones.find((m) => m.key === "customs")?.detail).toBe("Waiting For Commercial Paperwork");
  });

  it("says when the log holds more than it read", async () => {
    auditRows.listByShipmentId.mockResolvedValue(Array.from({ length: TRACKING_CHANGES_LIMIT + 1 }, (_, i) => change(i)));
    const t = await trackingService.get("s1", "c1");
    expect(t.changes).toHaveLength(TRACKING_CHANGES_LIMIT);
    expect(t.changesCapped).toBe(true);
  });

  it("still answers when Invoicing can't be asked, without saying invoiced or not", async () => {
    service.isInvoiced.mockRejectedValue(new Error("down"));
    const t = await trackingService.get("s1", "c1");
    expect(t.taxDate.invoiced).toBeNull();
    expect(t.milestones.length).toBeGreaterThan(0);
  });
});
