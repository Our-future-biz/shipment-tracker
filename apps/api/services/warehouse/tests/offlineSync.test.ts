import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { reweighService } from "../services/reweigh.service";
import { gateExceptionService } from "../services/gateException.service";
import { gateFileService } from "../services/gateFile.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";
import { warehouseExceptionTable } from "../schemas/warehouseException.schema";
import { EXCEPTION_GATE } from "../services/osd";
import { acceptRecordedAt, offlineDetail } from "../services/offline";
import { pragueDate } from "../services/storage";
import type { GateSurveyInput } from "../interfaces/gate.interfaces";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const MIN = 60_000;
const ago = (ms: number, from = Date.now()) => new Date(from - ms).toISOString();
const OFFLINE = /^Recorded offline at \d{2}:\d{2}( \(\d+ \w+\))?, sent \d{2}:\d{2}$/;

afterEach(() => vi.useRealTimers());

// An incoming (příjem) position linked to a shipment: its arrival writes the received date back.
async function inbound() {
  const c = randomUUID();
  const [r] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
  const id = r!.movementId!;
  await gateMovementRepository.update(id, c, { visit: "příjem", handling: "Export" });
  return { c, id };
}

const outboxOf = (movementId: string) => db.select().from(shipmentOutboxTable).where(eq(shipmentOutboxTable.movementId, movementId));
const eventsOf = async (id: string, c: string, kind: string) => (await gateMovementService.get(id, c)).events.filter((e) => e.kind === kind);

const survey = (container: string, damaged = 0): GateSurveyInput => ({
  container,
  phase: "Receipt — survey on gate in",
  damaged,
  lost: 0,
  lines: [{ qty: 10, outerPacking: "Carton", visual: [], inner: [] }],
  driverNote: "",
  warehouseNote: `damaged ${damaged}`,
});

describe("recorded time of a write sent later (offline queue)", () => {
  it("accepts a time within the window only", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    const mgr = { requestId: "r" };
    expect(acceptRecordedAt("2026-10-14T09:00:00Z", now, mgr).toISOString()).toBe("2026-10-14T09:00:00.000Z");
    expect(acceptRecordedAt("2026-10-14T12:00:00+02:00", now, mgr).toISOString()).toBe("2026-10-14T10:00:00.000Z");
    // A phone clock a little ahead is taken as now; more than 2 minutes is refused.
    expect(acceptRecordedAt("2026-10-14T10:01:30Z", now, mgr).toISOString()).toBe(now.toISOString());
    expect(() => acceptRecordedAt("2026-10-14T10:03:00Z", now, mgr)).toThrow(/in the future/);
    expect(() => acceptRecordedAt("2026-10-13T21:59:00Z", now, mgr)).toThrow(/more than 12 hours/);
    expect(() => acceptRecordedAt("yesterday", now, mgr)).toThrow(/ISO 8601/);
    expect(() => acceptRecordedAt("2026-10-14T09:00:00", now, mgr)).toThrow(/ISO 8601/);
    expect(() => acceptRecordedAt("2026-10-14T09:00:00Z", now, { ...mgr, notBefore: new Date("2026-10-14T09:30:00Z"), after: "the draft receipt" })).toThrow(
      /before the draft receipt/,
    );
    expect(offlineDetail(new Date("2026-10-14T08:05:00Z"), new Date("2026-10-14T08:40:00Z"))).toBe("Recorded offline at 10:05, sent 10:40");
    expect(offlineDetail(new Date("2026-10-13T21:50:00Z"), new Date("2026-10-13T22:10:00Z"))).toBe("Recorded offline at 23:50 (13 Oct), sent 00:10");
  });

  it("takes a recorded time only from floor mode, and accepts a late one up to the queue's 12 hours", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    expect(() => acceptRecordedAt("2026-10-14T09:59:00Z", now, {})).toThrow(/only from floor mode/);
    expect(acceptRecordedAt("2026-10-14T09:40:00Z", now, { requestId: "r" }).toISOString()).toBe("2026-10-14T09:40:00.000Z");
    // A phone offline for an hour in the yard: still accepted (logged for audit), not refused.
    expect(acceptRecordedAt("2026-10-14T09:00:00Z", now, { requestId: "r", userId: "u1" }).toISOString()).toBe("2026-10-14T09:00:00.000Z");
    expect(() => acceptRecordedAt("2026-10-13T21:00:00Z", now, { requestId: "r" })).toThrow(/more than 12 hours/);
  });
});

describe("stamps sent from the offline queue", () => {
  it("stamps the recorded time and logs that it was recorded offline", async () => {
    const { c, id } = await inbound();
    const recordedAt = ago(20 * MIN);
    const res = await gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", { recordedAt, clientRequestId: randomUUID() });
    expect(res.outcome).toBe("stamped");
    expect(res.notice).toMatch(/^Gate-in stamped \d{2}:\d{2} \(recorded offline, sent \d{2}:\d{2}\)$/);
    expect(res.movement.gateIn).toBe(recordedAt);
    expect(res.movement.status).toBe("In Warehouse");
    expect(res.movement.events.find((e) => e.kind === "gateIn")).toMatchObject({ at: recordedAt, detail: expect.stringMatching(OFFLINE) });
    const [owed] = await outboxOf(id);
    expect(owed!.payload).toMatchObject({ warehouseReceivedDate: pragueDate(new Date(recordedAt)) });
  });

  it("refuses times outside the window, out of order, and an offline WH release", async () => {
    const { c, id } = await inbound();
    const opts = (recordedAt: string) => ({ recordedAt, clientRequestId: randomUUID() });
    await expect(gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", opts(ago(-5 * MIN)))).rejects.toThrow(/in the future/);
    await expect(gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", opts(ago(13 * 60 * MIN)))).rejects.toThrow(/12 hours/);
    await expect(gateMovementService.stampWithOutcome(id, c, user, "impRelease", "user", opts(ago(MIN)))).rejects.toThrow(/WH release needs a connection/);
    await expect(gateMovementService.stamp(id, c, user, "gateIn", "user", { clientRequestId: "not-a-uuid" })).rejects.toThrow(/UUID/);

    await gateMovementService.stamp(id, c, user, "expDraft");
    // LCL cargo is re-weighed before its receipt.
    await reweighService.record(id, c, user, { weighedKg: 500 });
    await expect(gateMovementService.stampWithOutcome(id, c, user, "expReceipt", "user", opts(ago(10 * MIN)))).rejects.toThrow(/before the draft receipt/);
    await expect(gateMovementService.stampWithOutcome(id, c, user, "gateOut", "user", opts(ago(10 * MIN)))).rejects.toThrow(/before the arrival/);
    const ok = await gateMovementService.stampWithOutcome(id, c, user, "expReceipt", "user", opts(new Date().toISOString()));
    expect(ok.outcome).toBe("stamped");
    // Nothing of the refused tries reached the log.
    expect((await eventsOf(id, c, "expReceipt")).length).toBe(1);
  });

  it("refuses an offline draft receipt recorded before a gate-in stamped earlier", async () => {
    const { c, id } = await inbound();
    const opts = (recordedAt: string) => ({ recordedAt, clientRequestId: randomUUID() });
    await gateMovementService.stamp(id, c, user, "gateIn");
    await expect(gateMovementService.stampWithOutcome(id, c, user, "expDraft", "user", opts(ago(10 * MIN)))).rejects.toThrow(/before the gate-in/);
    const ok = await gateMovementService.stampWithOutcome(id, c, user, "expDraft", "user", opts(new Date().toISOString()));
    expect(ok.outcome).toBe("stamped");
    expect((await eventsOf(id, c, "expDraft")).length).toBe(1);
  });

  it("gives an export arrival recorded before midnight the day it arrived", async () => {
    const { c, id } = await inbound();
    // Sent at 00:30 Prague on 15 Oct, recorded at 23:50 on 14 Oct.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T22:30:00Z"));
    const res = await gateMovementService.stampWithOutcome(id, c, user, "expDraft", "manager", { recordedAt: "2026-10-14T21:50:00Z", clientRequestId: randomUUID() });
    vi.useRealTimers();
    expect(res.movement).toMatchObject({ gateIn: "2026-10-14T21:50:00.000Z", expDraft: "2026-10-14T21:50:00.000Z" });
    const arrival = res.movement.events.filter((e) => e.kind === "gateIn" || e.kind === "expDraft");
    expect(arrival).toEqual([
      expect.objectContaining({ kind: "gateIn", at: "2026-10-14T21:50:00.000Z", detail: "Recorded offline at 23:50 (14 Oct), sent 00:30" }),
      expect.objectContaining({ kind: "expDraft", at: "2026-10-14T21:50:00.000Z", detail: "Recorded offline at 23:50 (14 Oct), sent 00:30" }),
    ]);
    const owed = await outboxOf(id);
    expect(owed).toHaveLength(1);
    expect(owed[0]!.payload).toMatchObject({ warehouseReceivedDate: "2026-10-14" });
  });

  it("answers a replay of the same request as already stamped, once in the log and the outbox", async () => {
    const { c, id } = await inbound();
    const req = { recordedAt: ago(5 * MIN), clientRequestId: randomUUID() };
    expect((await gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", req)).outcome).toBe("stamped");
    const again = await gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", req);
    expect(again.outcome).toBe("already_stamped");
    expect(again.notice).toMatch(/^Gate-in was already sent from this phone \(stamped \d{2}:\d{2}\)$/);
    expect(await eventsOf(id, c, "gateIn")).toHaveLength(1);
    expect(await outboxOf(id)).toHaveLength(1);
  });

  it("lets one of parallel copies of a request stamp and answers the others", async () => {
    const { c, id } = await inbound();
    const req = { recordedAt: ago(2 * MIN), clientRequestId: randomUUID() };
    const all = await Promise.all(Array.from({ length: 4 }, () => gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", req)));
    expect(all.map((r) => r.outcome).sort()).toEqual(["already_stamped", "already_stamped", "already_stamped", "stamped"]);
    expect(await eventsOf(id, c, "gateIn")).toHaveLength(1);
    expect(await outboxOf(id)).toHaveLength(1);
  });

  it("tells the phone when another clerk stamped first; without a request id it stays an error", async () => {
    const { c, id } = await inbound();
    await gateMovementService.stamp(id, c, user, "gateIn");
    const res = await gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", { recordedAt: ago(MIN), clientRequestId: randomUUID() });
    expect(res.outcome).toBe("stamped_by_someone_else");
    expect(res.notice).toMatch(/^Gate-in was already stamped \d{2}:\d{2}/);
    expect(await eventsOf(id, c, "gateIn")).toHaveLength(1);
    await expect(gateMovementService.stamp(id, c, user, "gateIn")).rejects.toThrow(/Gate-in already stamped/);
    await expect(gateMovementService.stampWithOutcome(id, c, user, "gateIn", "user", { recordedAt: ago(MIN) })).rejects.toThrow(/Gate-in already stamped/);
  });
});

describe("survey saves sent from the offline queue", () => {
  it("keeps the latest survey of a container and pass and recognises a replay", async () => {
    const { c, id } = await inbound();
    await gateMovementService.saveSurvey(id, c, user, survey("TGHU 100", 1));
    const older = await gateMovementService.saveSurveyWithOutcome(id, c, user, survey("TGHU 100", 5), { recordedAt: ago(25 * MIN), clientRequestId: randomUUID() });
    expect(older.outcome).toBe("newer_exists");
    expect(older.notice).toMatch(/^A newer survey \(receipt, TGHU 100\) was saved at \d{2}:\d{2}/);
    expect(older.movement.surveys.find((s) => s.container === "TGHU 100")).toMatchObject({ damaged: 1, warehouseNote: "damaged 1" });

    const req = { recordedAt: ago(5 * MIN), clientRequestId: randomUUID() };
    const saved = await gateMovementService.saveSurveyWithOutcome(id, c, user, survey("TGHU 200", 2), req);
    expect(saved.outcome).toBe("saved");
    expect(saved.movement.surveys.find((s) => s.container === "TGHU 200")).toMatchObject({ damaged: 2, surveyedAt: req.recordedAt });
    expect(saved.movement.events.find((e) => e.kind === "surveySaved")).toMatchObject({ label: "Survey saved (receipt, TGHU 200)", at: req.recordedAt, detail: expect.stringMatching(OFFLINE) });

    const replay = await gateMovementService.saveSurveyWithOutcome(id, c, user, survey("TGHU 200", 2), req);
    expect(replay.outcome).toBe("already_saved");
    const parallel = await Promise.all([1, 2, 3].map(() => gateMovementService.saveSurveyWithOutcome(id, c, user, survey("TGHU 200", 2), req)));
    expect(parallel.every((r) => r.outcome === "already_saved")).toBe(true);
    expect(await eventsOf(id, c, "surveySaved")).toHaveLength(1);
    expect(replay.movement.surveys.filter((s) => s.container === "TGHU 200")).toHaveLength(1);

    // A later online save replaces it as before.
    const later = await gateMovementService.saveSurveyWithOutcome(id, c, user, survey("TGHU 200", 3));
    expect(later.outcome).toBe("saved");
    expect(later.movement.surveys.find((s) => s.container === "TGHU 200")!.damaged).toBe(3);
  });
});

describe("exceptions and photos sent from the offline queue", () => {
  it("records an exception once, however often it is sent", async () => {
    const { c, id } = await inbound();
    const exception = { type: "Damaged", pieces: 2, note: "wet cartons", clientRequestId: randomUUID(), recordedAt: ago(20 * MIN) };
    const first = await gateExceptionService.createWithOutcome(id, c, user, exception);
    expect(first.outcome).toBe("recorded");
    expect(first.movement.exceptions).toHaveLength(1);
    expect(first.movement.exceptions[0]!.createdAt).toBe(exception.recordedAt);
    expect(first.movement.events.find((e) => e.kind === "exceptionOpened")).toMatchObject({
      at: exception.recordedAt,
      detail: expect.stringMatching(/^wet cartons · Recorded offline at /),
    });

    const replay = await gateExceptionService.createWithOutcome(id, c, user, exception);
    expect(replay.outcome).toBe("already_recorded");
    expect(replay.notice).toMatch(/^Exception \(Damaged 2 pcs\) was already sent from this phone/);
    // A replay whose answer was lost comes back after the 12 hours, or with a skewed clock: still "already recorded".
    for (const late of [ago(13 * 60 * MIN), ago(-10 * MIN)]) {
      expect((await gateExceptionService.createWithOutcome(id, c, user, { ...exception, recordedAt: late })).outcome).toBe("already_recorded");
    }
    const parallel = { ...exception, clientRequestId: randomUUID() };
    const all = await Promise.all(Array.from({ length: 4 }, () => gateExceptionService.createWithOutcome(id, c, user, parallel)));
    expect(all.filter((r) => r.outcome === "recorded")).toHaveLength(1);

    const rows = await db.select().from(warehouseExceptionTable).where(eq(warehouseExceptionTable.movementId, id));
    expect(rows).toHaveLength(2);
    const m = await gateMovementService.get(id, c);
    expect(m.events.filter((e) => e.kind === "exceptionOpened")).toHaveLength(2);
    expect(m.releaseGates.find((g) => g.g === EXCEPTION_GATE)).toMatchObject({ s: "Blocked", note: "2 open: Damaged 2 pcs, Damaged 2 pcs" });
  });

  it("returns the photo already stored for a replayed upload", async () => {
    const { c, id } = await inbound();
    const upload = { fileName: "pc-3.jpg", fileType: "image/jpeg", contentBase64: Buffer.from("jpeg").toString("base64"), tag: "PC 3", clientRequestId: randomUUID() };
    const a = await gateFileService.upload(id, c, user, upload);
    const b = await gateFileService.upload(id, c, user, upload);
    expect(b.id).toBe(a.id);
    const [x, y] = await Promise.all([1, 2].map(() => gateFileService.upload(id, c, user, { ...upload, clientRequestId: upload.clientRequestId.replace(/^.{8}/, "00000000") })));
    expect(x!.id).toBe(y!.id);
    expect(await gateFileService.list(id, c)).toHaveLength(2);
    // The photo id can be attached to an exception sent after it.
    const res = await gateExceptionService.createWithOutcome(id, c, user, { type: "Damaged", pieces: 1, fileIds: [a.id], clientRequestId: randomUUID() });
    expect(res.movement.exceptions.at(-1)!.fileIds).toEqual([a.id]);
  });
});
