import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { gateSteps } from "@/app/warehouse/gate-log/_lib/steps";
import {
  LOCAL_PHOTO,
  applyPending,
  classifyError,
  enqueue,
  applyDiff,
  isTooOld,
  itemStatus,
  mergeStored,
  nextSendable,
  onResult,
  queueDiff,
  pendingStamps,
  resolvePhotoIds,
  resumeAfterReload,
  retryItem,
  uuid,
  type QueueItem,
} from "./queue";

const NOW = new Date("2026-10-14T10:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

let seq = 0;
function item(over: Partial<QueueItem> & { kind?: QueueItem["kind"] } = {}): QueueItem {
  seq += 1;
  const base = {
    id: `id-${seq}`,
    userId: "u1",
    userName: "Jana",
    movementId: "m1",
    ref: "WCZ2026000001",
    label: "Gate-in",
    recordedAt: minutesAgo(30),
    createdAt: minutesAgo(30),
    state: "waiting" as const,
    attempts: 0,
  };
  const kind = over.kind ?? "stamp";
  const payload =
    kind === "stamp"
      ? { kind: "gateIn" }
      : kind === "survey"
        ? { survey: { container: "TGHU2205539", phase: "Receipt — survey on gate in", damaged: 1, lost: 0, lines: [], driverNote: "", warehouseNote: "" } }
        : kind === "exception"
          ? { exception: { type: "Damaged", pieces: 2, note: "Wet", container: "", fileIds: [] } }
          : { fileName: "p.jpg", fileType: "image/jpeg", size: 1000, container: "", tag: "CTN" };
  return { ...base, kind, payload, ...over } as QueueItem;
}

describe("order and what may be sent", () => {
  it("sends the oldest first and ignores a repeat of the same id", () => {
    const a = item();
    const b = item({ movementId: "m2" });
    let q = enqueue([], a);
    q = enqueue(q, b);
    q = enqueue(q, a);
    expect(q.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(nextSendable(q, NOW, "u1")?.id).toBe(a.id);
  });

  it("holds a position's later items behind one that failed, and lets other positions go on", () => {
    const a = item({ state: "failed", error: "Stamp Gate-in first" });
    const b = item({ label: "Draft receipt", payload: { kind: "expDraft" } } as Partial<QueueItem>);
    const c = item({ movementId: "m2" });
    const q = [a, b, c];
    expect(nextSendable(q, NOW, "u1")?.id).toBe(c.id);
    expect(itemStatus(q, b, NOW, "u1")).toMatchObject({ state: "blocked" });
    expect(itemStatus(q, a, NOW, "u1")).toEqual({ state: "failed", why: "Stamp Gate-in first" });
    // Try again: the failed one is first in line again.
    expect(nextSendable(retryItem(q, a.id), NOW, "u1")?.id).toBe(a.id);
  });

  it("never sends another user's items, and says who must sign in", () => {
    const a = item({ userId: "u2", userName: "Petr" });
    expect(nextSendable([a], NOW, "u1")).toBeUndefined();
    expect(itemStatus([a], a, NOW, "u1")).toEqual({ state: "held_user", why: "Waiting for Petr to sign in" });
    expect(nextSendable([a], NOW, "u2")?.id).toBe(a.id);
  });

  it("keeps items older than 12 hours for the user to discard, and holds what follows", () => {
    const old = item({ recordedAt: minutesAgo(12 * 60 + 1) });
    const after = item();
    expect(isTooOld(old, NOW)).toBe(true);
    expect(isTooOld(after, NOW)).toBe(false);
    expect(itemStatus([old, after], old, NOW, "u1").state).toBe("too_old");
    expect(nextSendable([old, after], NOW, "u1")).toBeUndefined();
  });

  it("picks up items left sending when the page closed", () => {
    const a = item({ state: "sending" });
    expect(resumeAfterReload([a])[0]!.state).toBe("waiting");
  });

  it("makes UUIDs the server accepts", () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid()).not.toBe(id);
  });
});

describe("answers of the server", () => {
  it("drops a sent item; already there is finished too, with the words to show — never a loop", () => {
    const a = item();
    expect(onResult([a], a.id, { type: "done", outcome: "stamped" })).toEqual({ items: [], message: null });
    const again = onResult([a], a.id, { type: "done", outcome: "already_stamped", notice: "Gate-in was already stamped 10:05 by Jana" });
    expect(again.items).toEqual([]);
    expect(again.message).toEqual({ tone: "info", text: "Gate-in was already stamped 10:05 by Jana" });
    expect(onResult([a], a.id, { type: "done", outcome: "stamped_by_someone_else", notice: "" }).message?.tone).toBe("info");
    expect(onResult([a], a.id, { type: "done", outcome: "already_recorded" }).items).toEqual([]);
    const newer = onResult([a], a.id, { type: "done", outcome: "newer_exists", notice: "" });
    expect(newer.items).toEqual([]);
    expect(newer.message?.tone).toBe("warning");
  });

  it("keeps it waiting without a connection or when signed out, and marks it failed when refused", () => {
    const a = item();
    expect(onResult([a], a.id, { type: "offline", error: "No connection" }).items[0]).toMatchObject({ state: "waiting", attempts: 1 });
    expect(onResult([a], a.id, { type: "auth", error: "Signed out" }).items[0]).toMatchObject({ state: "waiting", attempts: 0 });
    const refused = onResult([a], a.id, { type: "refused", error: "Recorded more than 12 hours ago" });
    expect(refused.items[0]).toMatchObject({ state: "failed", error: "Recorded more than 12 hours ago" });
    expect(refused.message?.tone).toBe("error");
  });

  it("sorts errors: no network, signed out, server down, refused", () => {
    expect(classifyError(new TypeError("Failed to fetch")).type).toBe("offline");
    expect(classifyError({ status: 401, code: "unauthenticated", message: "x" }).type).toBe("auth");
    expect(classifyError({ status: 503, code: "unavailable", message: "x" }).type).toBe("offline");
    expect(classifyError({ status: 400, code: "invalid_argument", message: "Stamp Gate-in first" })).toEqual({ type: "refused", error: "Stamp Gate-in first" });
  });

  it("does not take a bug or an unreadable photo for a lost connection", () => {
    expect(classifyError(new TypeError("timeout")).type).toBe("offline");
    expect(classifyError(new DOMException("aborted", "AbortError")).type).toBe("offline");
    expect(classifyError(new Error("FileReader failed"))).toEqual({ type: "refused", error: "FileReader failed" });
    expect(classifyError(new RangeError("bad")).type).toBe("refused");
  });

  it("puts off an exception waiting for its photos without retrying it in a loop", () => {
    const ex = item({ kind: "exception" });
    const other = item({ movementId: "m2" });
    const after = onResult([ex, other], ex.id, { type: "deferred", error: "Waiting for its photos to be sent" });
    expect(after.items[0]).toMatchObject({ state: "waiting", attempts: 0 });
    expect(after.message).toBeNull();
    expect(nextSendable(after.items, NOW, "u1", new Set([ex.id]))?.id).toBe(other.id);
  });
});

describe("storage shared by tabs", () => {
  it("writes only what changed, item by item", () => {
    const a = item();
    const b = item();
    const c = item();
    const sent = { ...b, state: "sending" as const };
    expect(queueDiff([a, b, c], [a, sent])).toEqual({ put: [sent], remove: [c.id] });
    expect(queueDiff([a], [a])).toEqual({ put: [], remove: [] });
  });

  it("keeps another tab's items when one tab sends or discards its own", () => {
    const mine = item({ createdAt: minutesAgo(20) });
    const theirs = item({ createdAt: minutesAgo(10) });
    // Storage holds both; this tab knew only its own, and sent it.
    const stored = applyDiff([mine, theirs], queueDiff([mine], []));
    expect(stored.map((i) => i.id)).toEqual([theirs.id]);
    const added = item({ createdAt: minutesAgo(30) });
    expect(applyDiff(stored, { put: [added], remove: [] }).map((i) => i.id)).toEqual([added.id, theirs.id]);
  });

  it("reads storage as the truth, except this tab's writes still on their way", () => {
    const a = item({ createdAt: minutesAgo(30) });
    const b = item({ createdAt: minutesAgo(20) });
    const c = item({ createdAt: minutesAgo(10) });
    // Another tab sent `a` and queued `b`; this tab just queued `c` (not stored yet) and marked `x` failed.
    const x = item({ createdAt: minutesAgo(40) });
    const xFailed = { ...x, state: "failed" as const, error: "Refused" };
    const merged = mergeStored([x, b], [a, xFailed, c], new Set([c.id, x.id]));
    expect(merged.map((i) => i.id)).toEqual([x.id, b.id, c.id]);
    expect(merged[0]).toBe(xFailed);
    // This tab discarded `b` but the delete is not stored yet: it stays gone.
    expect(mergeStored([b], [], new Set([b.id]))).toEqual([]);
  });
});

describe("photos of an exception", () => {
  it("swaps local ids for the server's once uploaded, waits for queued ones, drops discarded ones", () => {
    const photo = item({ kind: "photo" });
    const ids = ["srv-1", `${LOCAL_PHOTO}up`, `${LOCAL_PHOTO}${photo.id}`, `${LOCAL_PHOTO}gone`];
    expect(resolvePhotoIds(ids, { up: "srv-2" }, [photo])).toEqual({ ids: ["srv-1", "srv-2"], pending: [photo.id], lost: ["gone"] });
  });
});

describe("the screen before the server answers", () => {
  const m = {
    id: "m1",
    visit: "příjem",
    status: "Expected",
    armed: false,
    releaseGates: [],
    gateIn: null,
    gateOut: null,
    impRelease: null,
    expDraft: null,
    expReceipt: null,
    events: [],
    surveys: [] as interfaces.GateSurvey[],
    exceptions: [] as interfaces.GateExceptionItem[],
    openExceptions: 0,
  };

  it("shows queued stamps with their time, so the next step moves on", () => {
    const a = item({ recordedAt: minutesAgo(20) });
    const shown = applyPending(m, [a]);
    expect(shown.gateIn).toBe(a.recordedAt);
    expect(shown.status).toBe("In Warehouse");
    expect(gateSteps(shown).map((s) => s.state)).toEqual(["done", "next", "later", "later"]);
    expect(pendingStamps([a], "m1")).toEqual(["gateIn"]);
    // Not another position's, nor a failed one.
    expect(applyPending(m, [item({ movementId: "m2" }), item({ state: "failed" })]).gateIn).toBeNull();
    expect(m.gateIn).toBeNull();
  });

  it("shows a queued survey unless the stored one is later, and a queued exception as open", () => {
    const s = item({ kind: "survey" });
    const shown = applyPending(m, [s]);
    expect(shown.surveys).toHaveLength(1);
    expect(shown.surveys[0]!.surveyedBy).toMatch(/waiting to send/);
    const later = { ...shown.surveys[0]!, surveyedAt: NOW.toISOString(), surveyedBy: "Petr", damaged: 0 };
    expect(applyPending({ ...m, surveys: [later] }, [s]).surveys[0]!.surveyedBy).toBe("Petr");
    const e = applyPending(m, [item({ kind: "exception" })]);
    expect(e.openExceptions).toBe(1);
    expect(e.exceptions[0]).toMatchObject({ type: "Damaged", pieces: 2, status: "open" });
  });
});
