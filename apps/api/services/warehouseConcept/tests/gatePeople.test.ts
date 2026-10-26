import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gatePeopleService } from "../services/gatePeople.service";
import { warehouseService } from "../services/warehouse.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { normalizedOwner, OLD_WALK_IN_OWNER, ownerFromRequest } from "../services/shipmentOwner";
import { shipmentData } from "./shipmentFakes";

// The Shipment Owner of a gate record and the assignee of a warehouse position are users of the
// company, stored by e-mail (owner decision 26 Oct 2026); the backfill turns old names into those
// e-mails.

const USERS = vi.hoisted(() => [
  { id: "0b6a3b0e-6f41-4c55-9a39-6c2f1f6f0a01", email: "lukas.novak@example.cz", displayName: "Lukáš Novák" },
  { id: "0b6a3b0e-6f41-4c55-9a39-6c2f1f6f0a02", email: "petr.svoboda@example.cz", displayName: "Petr Svoboda" },
  // Two users of the same name: their name alone fits neither.
  { id: "0b6a3b0e-6f41-4c55-9a39-6c2f1f6f0a03", email: "jan.novak@example.cz", displayName: "Jan Novák" },
  { id: "0b6a3b0e-6f41-4c55-9a39-6c2f1f6f0a04", email: "jan.novak2@example.cz", displayName: "Jan Novák" },
]);

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake(USERS),
  };
});

const company = () => randomUUID();
const user = USERS[0]!.id;
const PICK_A_USER = /Shipment Owner: pick a user of the company \(by e-mail\)/;
const PICK_AN_ASSIGNEE = /Assignee: pick a user of the company \(by e-mail\)/;
afterEach(() => shipmentData.clear());

describe("shipment owner rules", () => {
  it("stores a user's e-mail or nothing; the current value may be sent back as it is", async () => {
    const load = vi.fn(async () => USERS);
    expect(await ownerFromRequest("Lukáš", "Lukáš", load)).toBe("Lukáš");
    expect(await ownerFromRequest("", "Lukáš", load)).toBe("");
    expect(load).not.toHaveBeenCalled();
    expect(await ownerFromRequest(" Petr.Svoboda@Example.cz ", "Lukáš", load)).toBe("petr.svoboda@example.cz");
    await expect(ownerFromRequest("Petr Svoboda", null, load)).rejects.toThrow(PICK_A_USER);
    await expect(ownerFromRequest("someone@elsewhere.cz", "", load)).rejects.toThrow(PICK_A_USER);
  });

  it("backfills the one user an old value names and empties the walk-in placeholder", () => {
    expect(normalizedOwner(OLD_WALK_IN_OWNER, USERS)).toBe("");
    expect(normalizedOwner("Lukas Novak", USERS)).toBe("lukas.novak@example.cz");
    expect(normalizedOwner("lukas.novak", USERS)).toBe("lukas.novak@example.cz");
    expect(normalizedOwner("PETR.SVOBODA@example.cz", USERS)).toBe("petr.svoboda@example.cz");
    // Already a user's e-mail, no user, or more than one: stays.
    expect(normalizedOwner("lukas.novak@example.cz", USERS)).toBeNull();
    expect(normalizedOwner("Petr", USERS)).toBeNull();
    expect(normalizedOwner("Jan Novák", USERS)).toBeNull();
    expect(normalizedOwner("", USERS)).toBeNull();
  });
});

describe("shipment owner on gate records", () => {
  it("takes only a user of the company, by e-mail, when created or edited", async () => {
    const c = company();
    await expect(gateMovementService.create(c, user, { gateRef: "WCZ2026102601", shipmentOwner: "Lukáš Novák" })).rejects.toThrow(PICK_A_USER);
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026102601", shipmentOwner: "LUKAS.NOVAK@example.cz" });
    expect(m.shipmentOwner).toBe("lukas.novak@example.cz");

    expect((await gateMovementService.update(m.id, c, user, { shipmentOwner: "petr.svoboda@example.cz" })).shipmentOwner).toBe("petr.svoboda@example.cz");
    await expect(gateMovementService.update(m.id, c, user, { shipmentOwner: "Petr" })).rejects.toThrow(PICK_A_USER);
    await expect(gateMovementService.update(m.id, c, user, { shipmentOwner: "someone@elsewhere.cz" })).rejects.toThrow(PICK_A_USER);
    expect((await gateMovementService.update(m.id, c, user, { shipmentOwner: "" })).shipmentOwner).toBe("");
  });

  it("keeps an old name sent back unchanged with other edits", async () => {
    const c = company();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026102602" });
    await gateMovementRepository.update(m.id, c, { shipmentOwner: "Lukáš" });
    const saved = await gateMovementService.update(m.id, c, user, { shipmentOwner: "Lukáš", commodity: "Tyres" });
    expect(saved).toMatchObject({ shipmentOwner: "Lukáš", commodity: "Tyres" });
  });

  it("leaves a walk-in without an owner (the UI shows the notify-ops hint)", async () => {
    const m = await gateMovementService.create(company(), user, { walkIn: true, plate: "1AB 2345" });
    expect(m.shipmentOwner).toBe("");
  });

  it("checks the owner of a new stand-alone position", async () => {
    const c = company();
    await expect(warehouseImportService.createPosition(c, user, { shipmentOwner: "Lukáš" })).rejects.toThrow(PICK_A_USER);
    const { movement } = await warehouseImportService.createPosition(c, user, { shipmentOwner: "lukas.novak@example.cz" });
    expect(movement.shipmentOwner).toBe("lukas.novak@example.cz");
  });

  it("copies the shipment's person in charge as it is on import and refresh", async () => {
    const c = company();
    const shipmentId = randomUUID();
    shipmentData.set(shipmentId, { personInCharge: "Lukáš" });
    const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
    expect((await gateMovementService.get(r!.movementId!, c)).shipmentOwner).toBe("Lukáš");
    shipmentData.set(shipmentId, { personInCharge: "petr.svoboda@example.cz" });
    const { movement } = await warehouseImportService.refreshFromShipment(r!.movementId!, c, user);
    expect(movement.shipmentOwner).toBe("petr.svoboda@example.cz");
  });
});

describe("assignee of a warehouse position", () => {
  it("takes only a user of the company, by e-mail; the current value may be sent back as it is", async () => {
    const c = company();
    const { task } = await warehouseImportService.createPosition(c, user, {});
    await expect(warehouseService.update(task.id, c, { assignee: "Petr" })).rejects.toThrow(PICK_AN_ASSIGNEE);
    await expect(warehouseService.update(task.id, c, { assignee: "someone@elsewhere.cz" })).rejects.toThrow(PICK_AN_ASSIGNEE);
    expect((await warehouseService.update(task.id, c, { assignee: " PETR.SVOBODA@example.cz " })).assignee).toBe("petr.svoboda@example.cz");
    expect((await warehouseService.update(task.id, c, { assignee: "" })).assignee).toBe("");

    await warehouseTaskRepository.update(task.id, c, { assignee: "Lukáš" });
    expect(await warehouseService.update(task.id, c, { assignee: "Lukáš", notes: "Fragile" })).toMatchObject({ assignee: "Lukáš", notes: "Fragile" });
    // Edits that leave the assignee out don't touch it.
    expect((await warehouseService.update(task.id, c, { notes: "" })).assignee).toBe("Lukáš");
    // Another company's position is not found, whatever is sent.
    await expect(warehouseService.update(task.id, company(), { assignee: "" })).rejects.toThrow("Warehouse task not found");
  });
});

describe("gate people backfill", () => {
  it("turns old values into users' e-mails, reports the rest and changes nothing on a second run", async () => {
    const c = company();
    const other = company();
    const owners = ["Lukas Novak", "lukáš novák", OLD_WALK_IN_OWNER, "PETR.SVOBODA@example.cz", "lukas.novak@example.cz", "Jan Novák", "Petr", ""];
    const ids: string[] = [];
    for (const [i, owner] of owners.entries()) {
      const m = await gateMovementService.create(c, user, { gateRef: `WCZ20261026${10 + i}` });
      await gateMovementRepository.update(m.id, c, { shipmentOwner: owner });
      ids.push(m.id);
    }
    // An archived record is tied to the user too: only the way the same person is written changes.
    await gateMovementService.remove(ids[0]!, c, user);
    const elsewhere = await gateMovementService.create(other, user, { gateRef: "WCZ2026102699" });
    await gateMovementRepository.update(elsewhere.id, other, { shipmentOwner: "Lukas Novak" });

    const first = await gatePeopleService.normalize(c, USERS);
    expect(first).toEqual({
      checked: 7,
      changed: 4,
      unmatched: [
        { field: "shipmentOwner", value: "Jan Novák", count: 1 },
        { field: "shipmentOwner", value: "Petr", count: 1 },
      ],
    });
    const live = await gateMovementService.list(c, { archived: false });
    const archived = await gateMovementService.list(c, { archived: true });
    const ownerOf = (id: string) => [...live, ...archived].find((m) => m.id === id)!.shipmentOwner;
    expect(ids.map(ownerOf)).toEqual([
      "lukas.novak@example.cz",
      "lukas.novak@example.cz",
      "",
      "petr.svoboda@example.cz",
      "lukas.novak@example.cz",
      "Jan Novák",
      "Petr",
      "",
    ]);
    expect((await gateMovementService.get(elsewhere.id, other)).shipmentOwner).toBe("Lukas Novak");

    const again = await gatePeopleService.normalize(c, USERS);
    expect(again).toEqual({ checked: 6, changed: 0, unmatched: first.unmatched });
  });

  it("ties the positions' assignees to users too", async () => {
    const c = company();
    const ids: string[] = [];
    for (const assignee of ["Petr Svoboda", "Petr", "petr.svoboda@example.cz", ""]) {
      const { task } = await warehouseImportService.createPosition(c, user, {});
      await warehouseTaskRepository.update(task.id, c, { assignee });
      ids.push(task.id);
    }

    const first = await gatePeopleService.normalize(c, USERS);
    expect(first).toEqual({ checked: 3, changed: 1, unmatched: [{ field: "assignee", value: "Petr", count: 1 }] });
    const tasks = await warehouseService.listAll(c);
    expect(ids.map((id) => tasks.find((t) => t.id === id)!.assignee)).toEqual(["petr.svoboda@example.cz", "Petr", "petr.svoboda@example.cz", ""]);

    expect(await gatePeopleService.normalize(c, USERS)).toEqual({ checked: 3, changed: 0, unmatched: first.unmatched });
  });
});
