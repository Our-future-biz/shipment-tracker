import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { containerService } from "../services/container.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { warehouseContainerPositionTable, warehouseContainerTable } from "../schemas/warehouseRecords.schema";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [] })) },
  };
});

const user = randomUUID();
const cp = warehouseContainerPositionTable;

describe("one container, many positions", () => {
  it("lists a container with its houses, and each house shows its container", async () => {
    const c = randomUUID();
    const res = await warehouseImportService.importShipments(c, user, [randomUUID(), randomUUID()]);
    const ids = res.map((r) => r.movementId!);
    const box = await records.createContainer(c, { number: "msku 1", equipment: "40' HC", direction: "Unloading", vessel: "MSC ANNA", voyage: "042W", mblNumber: "MEDU123" }, user);
    expect(box).toMatchObject({ kind: "import", status: "Expected", positions: [], vessel: "MSC ANNA", mblNumber: "MEDU123" });
    const full = await containerService.addPositions(box.id, c, user, ids);
    expect(full.positions.map((p) => [p.movementId, p.sequence, p.stage])).toEqual([
      [ids[0], 1, "expected"],
      [ids[1], 2, "expected"],
    ]);
    const [listed] = await records.listContainers(c);
    expect(listed!.positions).toHaveLength(2);
    const m = await gateMovementService.get(ids[0]!, c);
    expect(m.container).toMatchObject({ id: box.id, number: "MSKU 1", kind: "import", status: "Expected", tallyOutcome: "" });
    expect(m.containers).toEqual([{ id: box.id, number: "MSKU 1", type: "40' HC" }]);
    // Direction is locked while the position is in a container.
    await expect(gateMovementService.update(ids[0]!, c, user, { visit: "příjem" })).rejects.toThrow(/in container MSKU 1/);
    // An inbound position does not belong in an import container.
    const inbound = await gateMovementService.create(c, user, { gateRef: "IN-1", handling: "Export", visit: "příjem" });
    await expect(containerService.addPositions(box.id, c, user, [inbound.id])).rejects.toThrow(/inbound cargo/);
    // The container's direction cannot change while it has houses; deleting it takes them out.
    await expect(records.updateContainer(box.id, c, { direction: "Loading" })).rejects.toThrow(/direction cannot change/);
    await records.deleteContainer(box.id, c);
    expect((await gateMovementService.get(ids[0]!, c)).container).toBeNull();
  });

  it("the register form's position becomes the first house; a deleted position leaves the plan", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ-R", handling: "Import", visit: "výdej" });
    const box = await records.createContainer(c, { movementId: m.id, number: "TGHU 1" }, user);
    expect(box).toMatchObject({ direction: "Unloading", movementId: m.id });
    expect(box.positions.map((p) => p.movementId)).toEqual([m.id]);
    await expect(records.createContainer(c, { movementId: m.id, number: "TGHU 2" }, user)).rejects.toThrow(/already in container TGHU 1/);
    await expect(records.createContainer(c, { movementId: m.id, number: "TGHU 3", direction: "Loading" }, user)).rejects.toThrow(/belongs in an import/);
    await gateMovementService.remove(m.id, c, user);
    expect((await containerService.detail(box.id, c)).positions).toEqual([]);
  });

  it("refuses removing a tallied house and archiving its position until the tally is voided", async () => {
    const c = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
    const id = r!.movementId!;
    const box = await records.createContainer(c, { number: "CAIU 9", direction: "Unloading" }, user);
    await containerService.addPositions(box.id, c, user, [id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.tally(box.id, c, user, "user", id, { outcome: "not_arrived", reason: "not on the truck" });
    await expect(containerService.removePosition(box.id, c, user, id)).rejects.toThrow(/tallied/);
    await expect(gateAdminService.archive(id, c, user, "manager", "x")).rejects.toThrow(/tallied in container CAIU 9/);
    await containerService.voidTally(box.id, c, user, "manager", id, "mistake");
    await gateAdminService.archive(id, c, user, "manager", "duplicate");
    expect((await containerService.detail(box.id, c)).events.at(-1)!.kind).toBe("removedFromContainer");
  });

  it("keeps old one-position containers working: the migration links them, surveys still see every container", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ-L", handling: "Import", visit: "výdej", loadInDate: "2026-10-01" });
    // Two containers registered the old way (movement_id only, no house link).
    const [a] = await db.insert(warehouseContainerTable).values({ companyId: c, movementId: m.id, number: "OLD 1", equipment: "20' DV", createdAt: new Date(Date.now() - 60_000) }).returning();
    const [b] = await db.insert(warehouseContainerTable).values({ companyId: c, movementId: m.id, number: "OLD 2", equipment: "40' DV" }).returning();
    expect((await gateMovementService.get(m.id, c)).containers.map((x) => x.number)).toEqual(["OLD 1", "OLD 2"]);

    // The backfill of migration 0017, as shipped.
    const file = readFileSync(path.resolve(__dirname, "../db/migrations/0017_container_positions_reweigh.sql"), "utf8");
    const insert = file.split("--> statement-breakpoint").find((x) => x.includes('INSERT INTO "warehouse_container_position"'))!;
    await db.execute(sql.raw(insert.replace(/^--.*$/gm, "")));
    const links = await db.select().from(cp).where(and(eq(cp.companyId, c), isNull(cp.deletedAt)));
    expect(links.map((l) => [l.containerId, l.movementId, l.addedBy])).toEqual([[a!.id, m.id, "migration"]]);

    const item = await gateMovementService.get(m.id, c);
    expect(item.containers.map((x) => x.number)).toEqual(["OLD 1", "OLD 2"]);
    expect(item.container).toMatchObject({ number: "OLD 1" });
    // A migrated one-position container keeps the received date typed by hand (no tally needed).
    expect(item.lifecycle.stage).toBe("in_warehouse");
    expect(item.storage.startSource).toBe("loadInDate");
    expect((await gateMovementService.update(m.id, c, user, { loadInDate: "2026-10-02" })).loadInDate).toBe("2026-10-02");
    expect(b).toBeTruthy();
  });
});
