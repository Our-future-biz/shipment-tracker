import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { warehouseRecordsService as svc } from "../services/warehouseRecords.service";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { pragueInstant } from "../services/dockSlots";

const user = randomUUID();

async function position(c: string, visit: "příjem" | "výdej" = "příjem", extra: Record<string, string> = {}) {
  return gateMovementService.create(c, user, { gateRef: `WCZ2026${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`, customer: "Alpine Trading", visit, plate: "3AB 1234", ...extra });
}

const DAY = "2026-10-14";

describe("dock slots linked to positions", () => {
  it("takes direction, reference, party and vehicle from the position and shows on the gate job", async () => {
    const c = randomUUID();
    const inbound = await position(c, "příjem");
    const outbound = await position(c, "výdej");
    const a = await svc.createDockSlot(c, { movementId: inbound.id, date: DAY, time: "08:00", dock: " Dock 2 ", direction: "OUT" });
    expect(a).toMatchObject({
      movementId: inbound.id,
      direction: "IN",
      dock: "Dock 2",
      reference: inbound.gateRef,
      party: "Alpine Trading",
      vehicle: "3AB 1234",
      durationMin: 60,
      end: "09:00",
      positionRef: "",
      customer: "Alpine Trading",
      visit: "příjem",
    });
    // 08:00 in Prague on 14 Oct (summer time) is 06:00 UTC.
    expect(a.startsAt).toBe("2026-10-14T06:00:00.000Z");
    expect(a.endsAt).toBe("2026-10-14T07:00:00.000Z");

    const b = await svc.createDockSlot(c, { movementId: outbound.id, date: DAY, time: "10:00", durationMin: 90, dock: "Dock 1", reference: "own ref" });
    expect(b).toMatchObject({ direction: "OUT", reference: "own ref", end: "11:30" });

    const item = await gateMovementService.get(inbound.id, c);
    expect(item.dockSlots).toEqual([
      expect.objectContaining({ id: a.id, dock: "Dock 2", date: DAY, time: "08:00", end: "09:00", direction: "IN", status: "Booked", durationMin: 60 }),
    ]);
    const listed = (await gateMovementService.list(c)).find((m) => m.id === outbound.id)!;
    expect(listed.dockSlots.map((s) => s.id)).toEqual([b.id]);

    // A cancelled slot is no longer shown on the gate job.
    await svc.updateDockSlot(a.id, c, { status: "Cancelled" });
    expect((await gateMovementService.get(inbound.id, c)).dockSlots).toEqual([]);
  });

  it("refuses a double booking of the same dock and names the clashing slot", async () => {
    const c = randomUUID();
    const p1 = await position(c);
    const p2 = await position(c);
    const first = await svc.createDockSlot(c, { movementId: p1.id, date: DAY, time: "08:00", dock: "Dock 2" });
    const clash = svc.createDockSlot(c, { movementId: p2.id, date: DAY, time: "08:30", dock: "Dock 2" });
    await expect(clash).rejects.toMatchObject({ code: "already_exists" });
    await expect(svc.createDockSlot(c, { movementId: p2.id, date: DAY, time: "07:30", dock: "Dock 2" })).rejects.toThrow(
      `Dock 2 is already booked 08:00–09:00 on ${DAY} for ${p1.gateRef} — pick another time or door`,
    );
    // A slot covering the whole booking clashes too.
    await expect(svc.createDockSlot(c, { movementId: p2.id, date: DAY, time: "07:00", durationMin: 180, dock: "Dock 2" })).rejects.toThrow(/already booked/);

    // Back to back is fine; another door, another company, another day are fine.
    expect((await svc.createDockSlot(c, { movementId: p2.id, date: DAY, time: "09:00", dock: "Dock 2" })).time).toBe("09:00");
    expect((await svc.createDockSlot(c, { movementId: p2.id, date: DAY, time: "07:00", dock: "Dock 2" })).end).toBe("08:00");
    expect((await svc.createDockSlot(c, { movementId: p2.id, date: DAY, time: "08:00", dock: "Dock 3" })).dock).toBe("Dock 3");
    const other = randomUUID();
    const p3 = await position(other);
    expect((await svc.createDockSlot(other, { movementId: p3.id, date: DAY, time: "08:00", dock: "Dock 2" })).dock).toBe("Dock 2");

    // Moving a slot onto a booked time is refused; moving it within its own time is fine.
    const late = await svc.createDockSlot(c, { movementId: p2.id, date: DAY, time: "12:00", dock: "Dock 2" });
    await expect(svc.updateDockSlot(late.id, c, { time: "08:15" })).rejects.toThrow(/already booked 08:00–09:00/);
    await expect(svc.updateDockSlot(late.id, c, { durationMin: 120, time: "08:30" })).rejects.toThrow(/already booked/);
    expect((await svc.updateDockSlot(late.id, c, { time: "12:30" })).end).toBe("13:30");

    // Cancelled, completed and deleted slots free the door.
    await svc.updateDockSlot(first.id, c, { status: "Cancelled" });
    const again = await svc.createDockSlot(c, { movementId: p1.id, date: DAY, time: "08:00", dock: "Dock 2" });
    await expect(svc.updateDockSlot(first.id, c, { status: "Booked" })).rejects.toThrow(/already booked/);
    await svc.updateDockSlot(again.id, c, { status: "Completed" });
    const third = await svc.createDockSlot(c, { movementId: p1.id, date: DAY, time: "08:00", dock: "Dock 2" });
    await svc.deleteDockSlot(third.id, c);
    expect((await svc.createDockSlot(c, { movementId: p1.id, date: DAY, time: "08:00", dock: "Dock 2" })).time).toBe("08:00");
  });

  it("lets exactly one of two parallel bookings of the same door win", async () => {
    const c = randomUUID();
    const p1 = await position(c);
    const p2 = await position(c);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => svc.createDockSlot(c, { movementId: i % 2 ? p1.id : p2.id, date: DAY, time: "14:00", dock: "Dock 4" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "already_exists", message: expect.stringMatching(/Dock 4 is already booked/) });
    }
    expect((await svc.listDockSlots(c)).filter((s) => s.dock === "Dock 4")).toHaveLength(1);
  });

  it("needs a live position of the same company and checks the input", async () => {
    const c = randomUUID();
    const p = await position(c);
    const foreign = await position(randomUUID());
    await expect(svc.createDockSlot(c, { date: DAY, time: "08:00", dock: "Dock 1" })).rejects.toThrow(/Pick the position/);
    await expect(svc.createDockSlot(c, { movementId: foreign.id, date: DAY, time: "08:00", dock: "Dock 1" })).rejects.toThrow(/Position not found/);
    await expect(svc.createDockSlot(c, { movementId: randomUUID(), date: DAY, time: "08:00", dock: "Dock 1" })).rejects.toThrow(/Position not found/);
    await expect(svc.createDockSlot(c, { movementId: p.id, date: DAY, time: "24:00", dock: "Dock 1" })).rejects.toThrow(/HH:MM/);
    // Not a real day: refused, never rolled over to 2 March.
    await expect(svc.createDockSlot(c, { movementId: p.id, date: "2026-02-30", time: "08:00", dock: "Dock 1" })).rejects.toThrow(/must be a date/);
    await expect(svc.createDockSlot(c, { movementId: p.id, date: DAY, time: "08:00", dock: "Dock 1", durationMin: 50 })).rejects.toThrow(/steps of 15/);
    await expect(svc.createDockSlot(c, { movementId: p.id, date: DAY, time: "08:00", dock: "Dock 1", durationMin: 600 })).rejects.toThrow(/15–480/);
    await expect(svc.createDockSlot(c, { movementId: p.id, date: DAY, time: "08:00", dock: "Dock 1", status: "Lost" })).rejects.toThrow(/Status must be/);

    const slot = await svc.createDockSlot(c, { movementId: p.id, date: DAY, time: "08:00", dock: "Dock 1" });
    await expect(svc.updateDockSlot(slot.id, c, { movementId: null })).rejects.toThrow(/Pick the position/);

    // An archived position cannot be booked; its existing slot can still be completed.
    await gateMovementService.remove(p.id, c, user);
    await expect(svc.createDockSlot(c, { movementId: p.id, date: DAY, time: "10:00", dock: "Dock 1" })).rejects.toThrow(/Position not found/);
    expect((await svc.updateDockSlot(slot.id, c, { status: "Completed" })).status).toBe("Completed");
  });

  // T8: the docks keep the Czech public holidays, as a trip's slot does (tripSlotWindow).
  it("refuses a slot on a Czech public holiday, booked or moved there; one already there can still be closed", async () => {
    const c = randomUUID();
    const p = await position(c);
    for (const holiday of ["2026-11-17", "2026-12-24", "2026-12-25"]) {
      await expect(svc.createDockSlot(c, { movementId: p.id, date: holiday, time: "08:00", dock: "Dock 1" })).rejects.toMatchObject({
        code: "failed_precondition",
        message: `The docks do not work on ${holiday}, a Czech public holiday — pick another day`,
      });
    }
    const slot = await svc.createDockSlot(c, { movementId: p.id, date: DAY, time: "08:00", dock: "Dock 1" });
    await expect(svc.updateDockSlot(slot.id, c, { date: "2026-12-24" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect((await svc.listDockSlots(c)).map((s) => s.date)).toEqual([DAY]);
    expect((await svc.updateDockSlot(slot.id, c, { status: "Completed" })).status).toBe("Completed");
  });

  it("works out the slot time in Prague time across the clock change", () => {
    expect(pragueInstant("2026-01-15", "08:00").toISOString()).toBe("2026-01-15T07:00:00.000Z");
    expect(pragueInstant("2026-07-15", "08:00").toISOString()).toBe("2026-07-15T06:00:00.000Z");
    expect(pragueInstant("2026-10-25", "08:00").toISOString()).toBe("2026-10-25T07:00:00.000Z");
    expect(pragueInstant("2026-03-29", "00:30").toISOString()).toBe("2026-03-28T23:30:00.000Z");
  });
});

describe("a gate record taken out of the Gate Log frees its door", () => {
  it("cancels its booked slots when it is deleted, so the door and time can be booked again", async () => {
    const c = randomUUID();
    const m = await position(c);
    const slot = await svc.createDockSlot(c, { movementId: m.id, date: DAY, time: "14:00", dock: "Dock 3" });
    await gateMovementService.remove(m.id, c, user);
    const other = await position(c);
    // Free again: the deleted record's slot no longer holds Dock 3 at 14:00.
    await expect(svc.createDockSlot(c, { movementId: other.id, date: DAY, time: "14:00", dock: "Dock 3" })).resolves.toMatchObject({ status: "Booked" });
    expect(slot.status).toBe("Booked");
  });

  // T6: a slot in progress is completed with its record - it stays as what happened, and the door is free.
  it("completes a slot in progress when the record is deleted or archived, so its door can be booked again", async () => {
    const c = randomUUID();
    const deleted = await position(c);
    const archived = await position(c);
    const a = await svc.createDockSlot(c, { movementId: deleted.id, date: DAY, time: "16:00", dock: "Dock 3" });
    const b = await svc.createDockSlot(c, { movementId: archived.id, date: DAY, time: "17:00", dock: "Dock 3" });
    await svc.updateDockSlot(a.id, c, { status: "In progress" });
    await svc.updateDockSlot(b.id, c, { status: "In progress" });
    await gateMovementService.remove(deleted.id, c, user);
    await gateAdminService.archive(archived.id, c, user, "manager", "Booked twice");
    const slots = new Map((await svc.listDockSlots(c)).map((s) => [s.id, s]));
    expect(slots.get(a.id)).toMatchObject({ status: "Completed", note: "gate record deleted" });
    expect(slots.get(b.id)).toMatchObject({ status: "Completed", note: "gate record archived: Booked twice" });
    const other = await position(c);
    await expect(svc.createDockSlot(c, { movementId: other.id, date: DAY, time: "16:00", dock: "Dock 3" })).resolves.toMatchObject({ status: "Booked" });
    await expect(svc.createDockSlot(c, { movementId: other.id, date: DAY, time: "17:00", dock: "Dock 3" })).resolves.toMatchObject({ status: "Booked" });
  });

  it("cancels them when a manager archives it too", async () => {
    const c = randomUUID();
    const m = await position(c);
    await svc.createDockSlot(c, { movementId: m.id, date: DAY, time: "15:00", dock: "Dock 3" });
    await gateAdminService.archive(m.id, c, user, "manager", "Booked twice");
    const other = await position(c);
    await expect(svc.createDockSlot(c, { movementId: other.id, date: DAY, time: "15:00", dock: "Dock 3" })).resolves.toMatchObject({ status: "Booked" });
  });
});
