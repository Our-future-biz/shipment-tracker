import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { managersCockpitService } from "../services/managersCockpit.service";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
// FCL: no re-weigh before the receipt.
const position = (c: string, handling: "Import" | "Export" = "Import") =>
  warehouseImportService.createPosition(c, user, { handling, operationType: handling === "Import" ? "FCL stripping" : "FCL stuffing", customsStatus: "Customs Cleared/Released", colli: 2, weightKg: 500, measureCbm: 2 });

describe("Managers cockpit (database)", () => {
  it("lists a refused record as urgent, leaves a released one out, counts a stamped archive — for the company only", async () => {
    const c = randomUUID();
    const { movement: refused } = await position(c);
    await gateMovementService.refuse(refused.id, c, user, "no delivery order");

    const { movement: released } = await position(c, "Export");
    await gateMovementRepository.update(released.id, c, { releaseGates: released.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    for (const kind of ["gateIn", "expDraft", "expReceipt", "impRelease"] as const) await gateMovementService.stamp(released.id, c, user, kind);

    const { movement: archived } = await position(c, "Export");
    await gateMovementService.stamp(archived.id, c, user, "gateIn");
    await gateAdminService.archive(archived.id, c, user, "manager", "entered twice");

    const cockpit = await managersCockpitService.cockpit(c);
    expect(cockpit.urgent.total).toBe(1);
    expect(cockpit.urgent.rows[0]).toMatchObject({ kind: "position", id: refused.id, direction: "Outbound" });
    expect(cockpit.urgent.rows[0]!.tags[0]!.text).toMatch(/^Refused \d{2}\.\d{2}\. \d{2}:\d{2}: no delivery order$/);
    const listed = [...cockpit.urgent.rows, ...cockpit.attention.rows].map((r) => r.id);
    expect(listed).not.toContain(released.id);
    expect(listed).not.toContain(archived.id);
    expect(cockpit.audit).toMatchObject({ refusals: 1, archivedWithStamps: 1, overrides: 0 });
    expect(cockpit.shipmentUpdates).toMatchObject({ failed: 0 });
    expect(cockpit.delivery).toEqual({ shipmentUpdatesWaiting: 0, truckingFailed: 0, truckingWaiting: 0, staleMinutes: 30, supplierEmailsFailed: 0, supplierEmailDays: 7 });

    const other = await managersCockpitService.cockpit(randomUUID());
    expect(other.urgent.total + other.attention.total).toBe(0);
    expect(other.audit).toMatchObject({ refusals: 0, archivedWithStamps: 0 });
  });

  it("is a managers' endpoint", () => {
    const src = readFileSync(path.join(__dirname, "../controllers/managersCockpit.controller.ts"), "utf8");
    expect(src).toMatch(/requireRole\("superadmin", "admin", "manager"\)/);
  });
});
