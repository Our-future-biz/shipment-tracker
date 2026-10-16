import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gateMovementService, MAX_PIN_TRIES } from "../services/gateMovement.service";
import { sectionItem, warehouseService } from "../services/warehouse.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { pickupPinKey } from "../services/pinKey";
import { hashPickupPin, newPickupPin, PICKUP_PIN_GATE, pickupPinMatches, pickupRowsFromInput, pinMatches, readPickup, stripPickupSecrets } from "../services/pickupPin";

// The real shipments and auth services need an authenticated caller, so the clients are
// replaced here; the acting user has a name so the logs can be checked.
const user = randomUUID();
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: {
      usersList: vi.fn(async () => ({ users: [{ id: user, displayName: "Eva Clerk", email: "eva@example.test" }] })),
      userLookup: vi.fn(async ({ ids }: { ids: string[] }) => ({
        users: ids.map((id) => ({ id, name: id === user ? "Eva Clerk" : "", role: "user" })),
      })),
    },
  };
});

afterEach(() => vi.restoreAllMocks());

const ROWS = [{ haulier: "Trans CZ", licensePlate: "3AB 1234", driver: "Petr Novák" }];

// A position linked to a shipment: it comes into the Gate Log as outbound (výdej).
async function linkedRow(c = randomUUID(), shipmentId = randomUUID()) {
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  const row = (await gateMovementService.list(c)).find((m) => m.id === r!.movementId)!;
  return { c, shipmentId, task: { id: r!.taskId!, taskId: r!.ref }, row };
}

const pickupOf = async (shipmentId: string, c: string) => readPickup((await warehouseService.getSection(shipmentId, "pickup", c))?.data);
// The PIN is only in the answer to "generate" (only its hash is stored), so the tests keep the
// last one issued per shipment.
const issued = new Map<string, string>();
async function gen(shipmentId: string, c: string, u: string) {
  const res = await gateMovementService.generatePickupPin(shipmentId, c, u);
  issued.set(`${c}:${shipmentId}`, res.pin);
  const data: Record<string, unknown> = { ...(res.row.data as Record<string, unknown>), pin: res.pin };
  return { ...res, data, pinId: readPickup(data).pinId };
}
const pinOf = async (shipmentId: string, c: string) => issued.get(`${c}:${shipmentId}`) ?? "";
const storedOf = async (shipmentId: string, c: string) => (await warehouseSectionRepository.findPickup(shipmentId, c))!.data as Record<string, unknown>;
const lineOf = (m: { releaseGates: { g: string; s: string; note: string }[] }) => m.releaseGates.filter((g) => g.g === PICKUP_PIN_GATE);
const raw = (id: string, c: string) => gateMovementRepository.findById(id, c);

// Every line OK except the Pick-up PIN line, which keeps what it has.
async function otherLinesOk(id: string, c: string) {
  const m = (await raw(id, c))!;
  await gateMovementRepository.update(id, c, { releaseGates: m.releaseGates.map((g) => (g.g === PICKUP_PIN_GATE ? g : { ...g, s: "OK" as const })) });
}

describe("pinMatches", () => {
  it("matches only the same PIN, in constant time, never empty", () => {
    expect(pinMatches("042917", "042917")).toBe(true);
    expect(pinMatches("042917", " 042917 ")).toBe(true);
    expect(pinMatches("042917", "042918")).toBe(false);
    expect(pinMatches("042917", "42917")).toBe(false);
    expect(pinMatches("042917", "0429170")).toBe(false);
    expect(pinMatches("", "")).toBe(false);
    expect(pinMatches("042917", "")).toBe(false);
    expect(pinMatches(null, "042917")).toBe(false);
    // PINs made before the switch (4 digits) still work.
    expect(pinMatches("4471", "4471")).toBe(true);
  });

  it("makes six digits from the secure source, not Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const pins = Array.from({ length: 500 }, newPickupPin);
    expect(pins.every((p) => /^\d{6}$/.test(p))).toBe(true);
    expect(new Set(pins).size).toBeGreaterThan(490);
    expect(random).not.toHaveBeenCalled();
  });

  it("takes only well-formed pick-up rows from the client", () => {
    expect(pickupRowsFromInput({ rows: JSON.stringify(ROWS), pin: "111111" })).toEqual(ROWS);
    expect(pickupRowsFromInput({ rows: JSON.stringify([{ haulier: "A", extra: 1 }]) })).toEqual([{ haulier: "A", licensePlate: "", driver: "" }]);
    expect(pickupRowsFromInput({ rows: "[" })).toBeNull();
    expect(pickupRowsFromInput({ rows: JSON.stringify([{ haulier: 5 }]) })).toBeNull();
    expect(pickupRowsFromInput({ rows: JSON.stringify(Array.from({ length: 51 }, () => ({}))) })).toBeNull();
    expect(pickupRowsFromInput({ pin: "111111" })).toBeNull();
    expect(pickupRowsFromInput("x")).toBeNull();
  });
});

describe("pick-up PIN made by the server", () => {
  it("generates a six-digit PIN once, keeps the rows and logs who made it", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    await warehouseService.upsertPickupRows(shipmentId, c, { rows: JSON.stringify(ROWS) });
    const random = vi.spyOn(Math, "random");
    const row = await gen(shipmentId, c, user);
    expect(random).not.toHaveBeenCalled();
    const p = readPickup(row.data);
    expect(p.pin).toMatch(/^\d{6}$/);
    expect(p).toMatchObject({ pinTries: 0, pinCreatedBy: "Eva Clerk", rows: ROWS });
    expect((row.data as { pinHistory: unknown[] }).pinHistory).toEqual([{ kind: "created", at: p.pinCreatedAt, by: "Eva Clerk" }]);

    await expect(gen(shipmentId, c, user)).rejects.toThrow(/already has a pick-up PIN/);
    expect(await pinOf(shipmentId, c)).toBe(p.pin);
  });

  it("never lets the client set or change the PIN or its tries", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    // No PIN yet: a client PIN is dropped.
    await warehouseService.upsertPickupRows(shipmentId, c, { pin: "1234", pinTries: 0, rows: "[]" });
    expect((await warehouseService.getSection(shipmentId, "pickup", c))!.data).toEqual({ rows: "[]" });

    const { pin, pinId } = readPickup((await gen(shipmentId, c, user)).data);
    await warehouseService.upsertPickupRows(shipmentId, c, { pin: "000000", pinId: "mine", pinTries: 0, pinCreatedBy: "Me", rows: JSON.stringify(ROWS) });
    expect(pin).toMatch(/^\d{6}$/);
    expect(await pickupOf(shipmentId, c)).toMatchObject({ pin: "", pinId, pinCreatedBy: "Eva Clerk", rows: ROWS });

    await expect(warehouseService.upsertPickupRows(shipmentId, c, { pin: "000000" })).rejects.toThrow(/Pick-up rows/);
    await expect(warehouseService.upsertPickupRows(shipmentId, c, { rows: "not json" })).rejects.toThrow(/Pick-up rows/);
  });

  it("keeps the tries when the rows are saved while the PIN is being checked", async () => {
    const { c, shipmentId, row } = await linkedRow();
    await gen(shipmentId, c, user);
    await gateMovementService.verifyPin(row.id, c, user, "999999");
    await warehouseService.upsertPickupRows(shipmentId, c, { pinTries: 0, rows: JSON.stringify(ROWS) });
    expect((await pickupOf(shipmentId, c)).pinTries).toBe(1);
  });
});

describe("Pick-up PIN line on the release gates", () => {
  it("is on linked outbound rows only", async () => {
    const { c, row, task } = await linkedRow();
    expect(lineOf(row)).toEqual([{ g: PICKUP_PIN_GATE, s: "Pending", note: "waiting for the driver's PIN" }]);
    expect(row.pickup).toMatchObject({ pinSet: false, tries: 0, locked: false });

    const unlinked = await gateMovementService.create(c, user, { gateRef: "WCZ2026101490", visit: "výdej" });
    expect(lineOf(unlinked)).toEqual([]);
    expect(unlinked.pickup).toBeNull();

    // A second gate row of the same task, made by hand, waits for the PIN too.
    const second = await gateMovementService.create(c, user, { warehouseTaskId: task.id, visit: "výdej" });
    expect(lineOf(second)).toHaveLength(1);
    const inbound = await gateMovementService.create(c, user, { warehouseTaskId: task.id, visit: "příjem", handling: "Export" });
    expect(lineOf(inbound)).toEqual([]);
    expect(inbound.pickup).toBeNull();
  });

  it("is added once to rows made before it existed, by the next action — never by a read", async () => {
    const { c, row } = await linkedRow();
    await gateMovementRepository.update(row.id, c, { releaseGates: row.releaseGates.filter((g) => g.g !== PICKUP_PIN_GATE) });
    expect(lineOf((await raw(row.id, c))!)).toEqual([]);

    await Promise.all([gateMovementService.get(row.id, c), gateMovementService.list(c)]);
    expect(lineOf((await raw(row.id, c))!)).toEqual([]);
    await Promise.all([gateMovementService.update(row.id, c, user, { note: "a" }), gateMovementService.update(row.id, c, user, { note: "b" })]);
    const after = await gateMovementService.get(row.id, c);
    expect(lineOf(after)).toEqual([{ g: PICKUP_PIN_GATE, s: "Pending", note: "waiting for the driver's PIN" }]);
    expect(after.events.filter((e) => e.kind === "pickupPinLine")).toHaveLength(1);
    expect(after.armed).toBe(false);
  });

  it("is not added to released rows", async () => {
    const { c, row } = await linkedRow();
    await gateMovementRepository.update(row.id, c, {
      impRelease: new Date(),
      status: "Released",
      releaseGates: row.releaseGates.filter((g) => g.g !== PICKUP_PIN_GATE),
    });
    expect(lineOf(await gateMovementService.get(row.id, c))).toEqual([]);
    expect(lineOf((await gateMovementService.list(c)).find((m) => m.id === row.id)!)).toEqual([]);
  });

  it("goes when the row is no longer outbound and comes back when it is again", async () => {
    const { c, row } = await linkedRow();
    const inbound = await gateMovementService.update(row.id, c, user, { handling: "Export" }, "manager", "wrong direction on import");
    expect(inbound.visit).toBe("příjem");
    expect(lineOf(inbound)).toEqual([]);
    expect(inbound.events.at(-1)).toMatchObject({ kind: "pickupPinLine", label: expect.stringMatching(/removed/), by: "Eva Clerk" });
    expect(inbound.events.some((e) => e.kind === "shipmentLinkChanged" && e.detail === "wrong direction on import")).toBe(true);
    const outbound = await gateMovementService.update(row.id, c, user, { handling: "Import" }, "manager", "back to import");
    expect(lineOf(outbound)).toHaveLength(1);
  });

  it("cannot be ticked by hand", async () => {
    const { c, row } = await linkedRow();
    await expect(gateMovementService.setReleaseGate(row.id, c, user, PICKUP_PIN_GATE, true)).rejects.toThrow(/set by the PIN check/);
    await expect(gateMovementService.setReleaseGate(row.id, c, user, "pick-up pin verified", true)).rejects.toThrow(/set by the PIN check/);
    expect(lineOf(await gateMovementService.get(row.id, c))[0]!.s).toBe("Pending");
  });

  it("refuses a gate PIN of its own on a linked outbound row", async () => {
    const { c, row, task } = await linkedRow();
    await expect(gateMovementService.update(row.id, c, user, { pin: "1234" })).rejects.toThrow(/pick-up PIN from Shipments/);
    await expect(gateMovementService.create(c, user, { warehouseTaskId: task.id, visit: "výdej", pin: "1234" })).rejects.toThrow(/pick-up PIN from Shipments/);
  });

  it("judges a gate PIN on the row as it is after the same update", async () => {
    const { c, row, task } = await linkedRow();
    // Unlinking and setting a gate PIN in one save is allowed: the row then uses its own PIN.
    const unlinked = await gateMovementService.update(row.id, c, user, { warehouseTaskId: "", pin: "1234" }, "manager", "not this shipment's cargo");
    expect(unlinked).toMatchObject({ shipmentId: null, hasPin: true, pickup: null });
    expect(lineOf(unlinked)).toEqual([]);
    // Linking and setting a gate PIN in one save is refused (that PIN would never be used).
    await expect(gateMovementService.update(row.id, c, user, { warehouseTaskId: task.id, pin: "4321" })).rejects.toThrow(/pick-up PIN from Shipments/);
    expect((await raw(row.id, c))!.warehouseTaskId).toBeNull();
  });

  it("lets only a manager, with a reason, unlink or turn a position linked to a shipment", async () => {
    const { c, row } = await linkedRow();
    await expect(gateMovementService.update(row.id, c, user, { warehouseTaskId: "" })).rejects.toThrow(/only a manager/);
    await expect(gateMovementService.update(row.id, c, user, { handling: "Export" })).rejects.toThrow(/only a manager/);
    await expect(gateMovementService.update(row.id, c, user, { visit: "příjem" }, "user", "because")).rejects.toThrow(/only a manager/);
    await expect(gateMovementService.update(row.id, c, user, { warehouseTaskId: "" }, "manager")).rejects.toThrow(/Give a reason/);
    expect((await raw(row.id, c))!.warehouseTaskId).not.toBeNull();
  });

  it("keeps the PIN required on a linked outbound row even when its line goes missing", async () => {
    const { c, row } = await linkedRow();
    expect((await raw(row.id, c))!.pickupShipmentId).not.toBeNull();
    await otherLinesOk(row.id, c);
    // The PIN line removed behind the service's back: the release still needs it.
    await db.execute(sql`UPDATE warehouse_gate_movement SET release_gates = '[]'::jsonb WHERE id = ${row.id}`);
    await expect(gateMovementService.stamp(row.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);
  });

  it("goes with the next action when the linked task is deleted, so the row is not stuck", async () => {
    const { c, row, task } = await linkedRow();
    await warehouseTaskRepository.softDelete(task.id, c);
    const m = await gateMovementService.update(row.id, c, user, { note: "task gone" });
    expect(m.shipmentId).toBeNull();
    expect(lineOf(m)).toEqual([]);
    expect(m.events.filter((e) => e.kind === "pickupPinLine" && /removed/.test(e.label))).toHaveLength(1);
  });

  it("goes back to Pending when the row is linked to another shipment", async () => {
    const { c, shipmentId, row } = await linkedRow();
    await gen(shipmentId, c, user);
    await otherLinesOk(row.id, c);
    expect(await gateMovementService.verifyPin(row.id, c, user, await pinOf(shipmentId, c))).toMatchObject({ result: "match" });
    expect(lineOf(await gateMovementService.get(row.id, c))[0]!.s).toBe("OK");

    const other = await warehouseTaskRepository.createForShipment(c, randomUUID());
    const moved = await gateMovementService.update(row.id, c, user, { warehouseTaskId: other.task.id }, "manager", "linked to the wrong job");
    expect(moved.shipmentId).toBe(other.task.shipmentId);
    expect(lineOf(moved)).toEqual([{ g: PICKUP_PIN_GATE, s: "Pending", note: "linked to another shipment — check the PIN again" }]);
    expect(moved.events.at(-1)).toMatchObject({ kind: "pickupPinLine", label: expect.stringMatching(/another shipment/), by: "Eva Clerk" });
    expect(moved.armed).toBe(false);
    await expect(gateMovementService.stamp(row.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);
  });
});

describe("PIN check at the gate", () => {
  it("checks the driver's PIN against the pick-up PIN and ticks the line", async () => {
    const { c, shipmentId, row } = await linkedRow();
    expect(await gateMovementService.verifyPin(row.id, c, user, "123456")).toEqual({ result: "no_pin", tries: 0 });

    await warehouseService.upsertPickupRows(shipmentId, c, { rows: JSON.stringify(ROWS) });
    await gen(shipmentId, c, user);
    const pin = await pinOf(shipmentId, c);
    const wrong = pin === "000000" ? "111111" : "000000";
    await otherLinesOk(row.id, c);

    expect(await gateMovementService.verifyPin(row.id, c, user, wrong)).toEqual({ result: "no_match", tries: 1 });
    let m = await gateMovementService.get(row.id, c);
    expect(lineOf(m)[0]!.s).toBe("Pending");
    expect(m).toMatchObject({ hasPin: true, pinTries: 1, pinLocked: false, armed: false });
    expect(m.pickup).toMatchObject({ pinSet: true, tries: 1, locked: false, pinCreatedBy: "Eva Clerk", rows: ROWS });
    await expect(gateMovementService.stamp(row.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);

    expect(await gateMovementService.verifyPin(row.id, c, user, pin)).toEqual({ result: "match", tries: 1 });
    m = await gateMovementService.get(row.id, c);
    expect(lineOf(m)).toEqual([{ g: PICKUP_PIN_GATE, s: "OK", note: expect.stringMatching(/^verified \d{2}:\d{2} · by Eva Clerk$/) }]);
    expect(m.events.at(-1)).toMatchObject({ kind: "pickupPinVerified", label: PICKUP_PIN_GATE, by: "Eva Clerk" });
    expect(m.armed).toBe(true);
    expect((await pickupOf(shipmentId, c)).pinTries).toBe(1);

    // The PIN never leaves the server on the gate side.
    expect(JSON.stringify(m)).not.toContain(pin);
    expect(JSON.stringify(await gateMovementService.list(c))).not.toContain(pin);

    const released = await gateMovementService.stamp(row.id, c, user, "impRelease");
    expect(released).toMatchObject({ status: "Released" });
  });

  it("locks after three wrong PINs, logs it once and refuses even the right PIN", async () => {
    const { c, shipmentId, row } = await linkedRow();
    await gen(shipmentId, c, user);
    const pin = await pinOf(shipmentId, c);
    const wrong = pin === "000000" ? "111111" : "000000";
    expect((await gateMovementService.verifyPin(row.id, c, user, wrong)).result).toBe("no_match");
    expect((await gateMovementService.verifyPin(row.id, c, user, wrong)).result).toBe("no_match");
    expect(await gateMovementService.verifyPin(row.id, c, user, wrong)).toEqual({ result: "locked", tries: MAX_PIN_TRIES });
    expect(await gateMovementService.verifyPin(row.id, c, user, pin)).toEqual({ result: "locked", tries: MAX_PIN_TRIES });
    const m = await gateMovementService.get(row.id, c);
    expect(m.events.filter((e) => e.kind === "pinLocked")).toHaveLength(1);
    expect(m).toMatchObject({ pinLocked: true, pinTries: 3 });
    expect(m.pickup).toMatchObject({ locked: true, tries: 3 });
    expect(lineOf(m)[0]!.s).toBe("Pending");
    expect((await pickupOf(shipmentId, c)).pinTries).toBe(3);
  });

  it("shares the three tries between gate rows of one shipment", async () => {
    const { c, shipmentId, row, task } = await linkedRow();
    const second = await gateMovementService.create(c, user, { warehouseTaskId: task.id, visit: "výdej" });
    await gen(shipmentId, c, user);
    const wrong = (await pinOf(shipmentId, c)) === "000000" ? "111111" : "000000";
    await gateMovementService.verifyPin(row.id, c, user, wrong);
    await gateMovementService.verifyPin(second.id, c, user, wrong);
    expect((await gateMovementService.verifyPin(row.id, c, user, wrong)).result).toBe("locked");
    expect((await gateMovementService.verifyPin(second.id, c, user, wrong)).result).toBe("locked");
  });

  it("gives ten parallel wrong PINs no more than three tries", async () => {
    const { c, shipmentId, row } = await linkedRow();
    await gen(shipmentId, c, user);
    const wrong = (await pinOf(shipmentId, c)) === "000000" ? "111111" : "000000";
    const results = await Promise.all(Array.from({ length: 10 }, () => gateMovementService.verifyPin(row.id, c, user, wrong)));
    expect(results.filter((r) => r.result === "no_match")).toHaveLength(2);
    expect(results.filter((r) => r.result === "locked")).toHaveLength(8);
    expect((await pickupOf(shipmentId, c)).pinTries).toBe(3);
    expect((await gateMovementService.get(row.id, c)).events.filter((e) => e.kind === "pinLocked")).toHaveLength(1);
  });

  it("does not report a lock while a right PIN only holds a try for a moment", async () => {
    const { c, shipmentId, row } = await linkedRow();
    await gen(shipmentId, c, user);
    const pin = await pinOf(shipmentId, c);
    const wrong = pin === "000000" ? "111111" : "000000";
    await gateMovementService.verifyPin(row.id, c, user, wrong);
    await gateMovementService.verifyPin(row.id, c, user, wrong);
    const results = await Promise.all(Array.from({ length: 4 }, () => gateMovementService.verifyPin(row.id, c, user, pin)));
    expect(results.map((r) => r.result)).toEqual(["match", "match", "match", "match"]);
    expect((await pickupOf(shipmentId, c)).pinTries).toBe(2);
  });

  it("never uses another company's pick-up PIN", async () => {
    const shipmentId = randomUUID();
    const a = await linkedRow(randomUUID(), shipmentId);
    const b = await linkedRow(randomUUID(), shipmentId);
    await gen(shipmentId, a.c, user);
    const pin = await pinOf(shipmentId, a.c);
    expect(await gateMovementService.verifyPin(b.row.id, b.c, user, pin)).toEqual({ result: "no_pin", tries: 0 });
    expect((await gateMovementService.get(b.row.id, b.c)).pickup).toMatchObject({ pinSet: false });
    await expect(gateMovementService.verifyPin(a.row.id, b.c, user, pin)).rejects.toThrow(/not found/);
  });

  it("keeps the gate PIN of unlinked rows", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026101491", visit: "výdej", pin: "4471" });
    expect(m).toMatchObject({ hasPin: true, pickup: null });
    expect(await gateMovementService.verifyPin(m.id, c, user, "4471")).toEqual({ result: "match", tries: 0 });
  });
});

describe("new PIN from operations", () => {
  it("is allowed only once the PIN is locked, and starts the check again", async () => {
    const { c, shipmentId, row, task } = await linkedRow();
    const second = await gateMovementService.create(c, user, { warehouseTaskId: task.id, visit: "výdej" });
    const first = readPickup((await gen(shipmentId, c, user)).data);
    const wrong = first.pin === "000000" ? "111111" : "000000";

    // The first row is verified and released with the old PIN.
    expect((await gateMovementService.verifyPin(row.id, c, user, first.pin)).result).toBe("match");
    await otherLinesOk(row.id, c);
    await gateMovementService.stamp(row.id, c, user, "impRelease");
    // The second row is verified too, then the PIN gets locked.
    expect((await gateMovementService.verifyPin(second.id, c, user, first.pin)).result).toBe("match");
    await expect(gen(shipmentId, c, user)).rejects.toThrow(/already has a pick-up PIN/);
    for (let i = 0; i < 3; i++) await gateMovementService.verifyPin(second.id, c, user, wrong);
    expect((await gateMovementService.get(second.id, c)).pinLocked).toBe(true);

    const renewed = readPickup((await gen(shipmentId, c, user)).data);
    expect(renewed.pin).toMatch(/^\d{6}$/);
    expect(renewed.pinId).not.toBe(first.pinId);
    expect(renewed.pinTries).toBe(0);
    const history = ((await warehouseService.getSection(shipmentId, "pickup", c))!.data as { pinHistory: { kind: string }[] }).pinHistory;
    expect(history.map((h) => h.kind)).toEqual(["created", "renewed"]);

    const open = await gateMovementService.get(second.id, c);
    expect(lineOf(open)).toEqual([{ g: PICKUP_PIN_GATE, s: "Pending", note: "new PIN generated — check again" }]);
    expect(open.events.at(-1)).toMatchObject({ kind: "pickupPinRenewed", by: "Eva Clerk" });
    expect(open).toMatchObject({ pinLocked: false, pinTries: 0 });
    const done = await gateMovementService.get(row.id, c);
    expect(lineOf(done)[0]!.s).toBe("OK");
    expect(done.events.some((e) => e.kind === "pickupPinRenewed")).toBe(false);

    if (renewed.pin !== first.pin) {
      expect((await gateMovementService.verifyPin(second.id, c, user, first.pin)).result).toBe("no_match");
    }
    expect((await gateMovementService.verifyPin(second.id, c, user, renewed.pin)).result).toBe("match");
    expect(lineOf(await gateMovementService.get(second.id, c))[0]!.s).toBe("OK");
  });

  it("does not tick the line when the PIN is renewed during the check", async () => {
    const { c, shipmentId, row } = await linkedRow();
    await gen(shipmentId, c, user);
    const pin = await pinOf(shipmentId, c);
    const wrong = pin === "000000" ? "111111" : "000000";
    await gateMovementService.verifyPin(row.id, c, user, wrong);
    await gateMovementService.verifyPin(row.id, c, user, wrong);

    // The right PIN takes the last try; operations, seeing it locked, make a new PIN right then.
    const take = warehouseSectionRepository.takePickupPinTry.bind(warehouseSectionRepository);
    vi.spyOn(warehouseSectionRepository, "takePickupPinTry").mockImplementationOnce(async (...args) => {
      const taken = await take(...args);
      await gen(shipmentId, c, user);
      return taken;
    });
    await expect(gateMovementService.verifyPin(row.id, c, user, pin)).rejects.toThrow(/renewed meanwhile/);
    const m = await gateMovementService.get(row.id, c);
    expect(lineOf(m)[0]!.s).toBe("Pending");
    expect((await pickupOf(shipmentId, c)).pinTries).toBe(0);
  });
});

describe("WH release of linked outbound cargo", () => {
  it("is blocked until the PIN is verified, even if the line went missing, unless overridden", async () => {
    const { c, row } = await linkedRow();
    await otherLinesOk(row.id, c);
    await expect(gateMovementService.stamp(row.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);

    // The line is gone and not put back on read: the release itself still refuses.
    vi.spyOn(gateMovementRepository, "ensurePickupLine").mockResolvedValue();
    const m = (await raw(row.id, c))!;
    await gateMovementRepository.update(row.id, c, { releaseGates: m.releaseGates.filter((g) => g.g !== PICKUP_PIN_GATE) });
    // The row remembers whose PIN releases it, so it is shown and refused as not armed.
    expect((await gateMovementService.get(row.id, c)).armed).toBe(false);
    await expect(gateMovementService.stamp(row.id, c, user, "impRelease")).rejects.toThrow(/NOT armed/);
    expect((await raw(row.id, c))!.impRelease).toBeNull();

    await gateMovementService.override(row.id, c, user, "driver known, PIN lost");
    expect((await gateMovementService.stamp(row.id, c, user, "impRelease")).status).toBe("Released");
  });
});

describe("pick-up PIN stored as a hash only", () => {
  it("stores the HMAC, never the PIN, and no section read shows either", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const { pin, row } = await gen(shipmentId, c, user);
    const stored = await storedOf(shipmentId, c);
    expect(stored.pin).toBeUndefined();
    expect(stored.pinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(pin);
    expect((row.data as Record<string, unknown>).pin).toBeUndefined();
    // What the section endpoints answer (sectionItem) — the generate answer too.
    const read = sectionItem((await warehouseService.getSection(shipmentId, "pickup", c))!).data as Record<string, unknown>;
    expect((sectionItem(row).data as Record<string, unknown>).pinHash).toBeUndefined();
    expect(read.pin).toBeUndefined();
    expect(read.pinHash).toBeUndefined();
  });

  it("still accepts a plain PIN stored before hashing, then hashes it", async () => {
    const { c, shipmentId, row } = await linkedRow();
    const { pinId } = await gen(shipmentId, c, user);
    // As an old row looked: the plain PIN, no hash.
    await db.execute(sql`UPDATE warehouse_section SET data = (data - 'pinHash') || '{"pin":"424242"}'::jsonb
      WHERE company_id = ${c} AND shipment_id = ${shipmentId} AND section = 'pickup'`);
    expect((await gateMovementService.verifyPin(row.id, c, user, "424242")).result).toBe("match");
    const stored = await storedOf(shipmentId, c);
    expect(stored.pin).toBeUndefined();
    expect(stored.pinId).toBe(pinId);
    expect(pickupPinMatches({ pin: "", pinHash: String(stored.pinHash), pinId }, "424242", pickupPinKey())).toBe(true);
  });

  it("only managers generate the PIN", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../controllers/pickupPin.controller.ts", import.meta.url), "utf8"));
    expect(src).toMatch(/requireRole\("superadmin", "admin", "manager"\)/);
  });
});

describe("pick-up PIN hash helpers", () => {
  it("binds the hash to the key and the PIN id", () => {
    const h = hashPickupPin("k", "id1", "123456");
    expect(pickupPinMatches({ pin: "", pinHash: h, pinId: "id1" }, " 123456 ", "k")).toBe(true);
    expect(pickupPinMatches({ pin: "", pinHash: h, pinId: "id2" }, "123456", "k")).toBe(false);
    expect(pickupPinMatches({ pin: "", pinHash: h, pinId: "id1" }, "123456", "other")).toBe(false);
    expect(pickupPinMatches({ pin: "", pinHash: h, pinId: "id1" }, "", "k")).toBe(false);
    expect(pickupPinMatches({ pin: "777777", pinHash: "", pinId: "x" }, "777777", "k")).toBe(true);
  });

  it("strips the PIN and its hash from section data", () => {
    expect(stripPickupSecrets({ pin: "1", pinHash: "h", pinId: "i", rows: "[]" })).toEqual({ pinId: "i", rows: "[]" });
  });
});
