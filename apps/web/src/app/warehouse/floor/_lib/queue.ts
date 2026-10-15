import type { interfaces } from "@/lib/api/client";
import type { StepKind } from "@/app/warehouse/gate-log/_lib/steps";
import { surveyPhaseKey } from "@/app/warehouse/gate-log/_lib/gate";

// Floor mode's offline queue: stamps, survey saves, exceptions, photos, re-weighs and a container's
// tally ticks, stuffed marks and gate-in / start of stripping made on the phone while
// there is no connection wait here and are sent, in the order they were made, once the phone is
// back online. Each carries the time it was made (`recordedAt`) and an id of its own (`id`, sent
// as `clientRequestId`), so the server applies it once however often it is sent. Pure helpers
// (tested in queue.test.ts); storage is queueStore.ts, sending useFloorQueue.

type Movement = interfaces.GateMovementItem;
type Container = interfaces.WarehouseContainerItem;

/** The server refuses a queued write older than this (apps/api/services/warehouse/services/offline.ts). */
export const QUEUE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Photo ids an exception refers to before the photo is uploaded. */
export const LOCAL_PHOTO = "local:";

export type StampPayload = { kind: StepKind };
export type SurveyPayload = { survey: interfaces.GateSurveyInput };
export type ExceptionPayload = { exception: Omit<interfaces.GateExceptionInput, "clientRequestId" | "recordedAt"> };
/** The photo's bytes are kept beside the item (queueStore blobs, key = item id). */
export type PhotoPayload = { fileName: string; fileType: string; size: number; container: string; tag: string };
/** A re-weigh (LCL); photo ids may be `local:<id>` of photos still queued. */
export type ReweighPayload = { reweigh: { weighedKg: number; note: string; fileIds: string[] } };
/** A house of a container ticked off / short / not arrived at the stripping tally. */
export type TallyPayload = { containerId: string; containerNumber: string; tally: interfaces.ContainerTallyInput };
/** A house of an export container marked stuffed (or back out). */
export type StuffedPayload = { containerId: string; containerNumber: string; stuffed: boolean };
/** A container stamp the phone may keep (the close and the gate-out need a connection). */
export type ContainerStampPayload = { containerId: string; containerNumber: string; kind: "gateIn" | "strippingStart" };

/** Queue key of a container's own writes (they belong to no position). */
export const containerChain = (containerId: string) => `container:${containerId}`;

type Base = {
  /** Also the clientRequestId sent to the server. */
  id: string;
  userId: string;
  userName: string;
  /** The position (gate movement) it is for; a container's own stamp: containerChain(id). */
  movementId: string;
  /** The container it is done in (tally, stuffed, container stamp): its writes keep their order too. */
  containerId?: string;
  /** The position's warehouse ref, for the list. */
  ref: string;
  /** What it is, in words ("Gate-in", "Survey (receipt, TGHU 220553-9)", "Photo CTN"). */
  label: string;
  /** When it was made on the phone (ISO). */
  recordedAt: string;
  /** When it went into the queue (ISO). */
  createdAt: string;
  state: "waiting" | "sending" | "failed";
  error?: string;
  attempts: number;
};
export type QueueItem =
  | (Base & { kind: "stamp"; payload: StampPayload })
  | (Base & { kind: "survey"; payload: SurveyPayload })
  | (Base & { kind: "exception"; payload: ExceptionPayload })
  | (Base & { kind: "photo"; payload: PhotoPayload })
  | (Base & { kind: "reweigh"; payload: ReweighPayload })
  | (Base & { kind: "tally"; payload: TallyPayload })
  | (Base & { kind: "stuffed"; payload: StuffedPayload })
  | (Base & { kind: "containerStamp"; payload: ContainerStampPayload });
export type QueueKind = QueueItem["kind"];

/** What the list shows for an item. */
export type ItemStatus =
  | { state: "waiting" | "sending" }
  | { state: "failed"; why: string }
  | { state: "too_old"; why: string }
  | { state: "held_user"; why: string }
  /** An earlier item of the same position failed or is too old: this one waits for it. */
  | { state: "blocked"; why: string };

/** A UUID; crypto.randomUUID exists only on https / localhost, getRandomValues everywhere. */
export function uuid(rand: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const b = rand(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const isTooOld = (item: Pick<QueueItem, "recordedAt">, now: Date) => now.getTime() - new Date(item.recordedAt).getTime() > QUEUE_MAX_AGE_MS;

/** Adds an item at the end (a repeat of the same id is ignored). */
export const enqueue = (items: QueueItem[], item: QueueItem): QueueItem[] => (items.some((i) => i.id === item.id) ? items : [...items, item]);

/**
 * Two items whose order matters: the same position, or the same container (its gate-in before the
 * tally ticks and stuffed marks done in it).
 */
export const sameChain = (a: Pick<QueueItem, "movementId" | "containerId">, b: Pick<QueueItem, "movementId" | "containerId">) =>
  a.movementId === b.movementId || (!!a.containerId && a.containerId === b.containerId);

/** How an item stands now, for the list and the sender. */
export function itemStatus(items: QueueItem[], item: QueueItem, now: Date, userId: string | undefined): ItemStatus {
  if (item.state === "failed") return { state: "failed", why: item.error || "Refused" };
  if (isTooOld(item, now)) return { state: "too_old", why: "Made more than 12 hours ago — too old to send. Record it again and discard this one." };
  if (item.userId !== userId) return { state: "held_user", why: `Waiting for ${item.userName || "the user who made it"} to sign in` };
  const before = items.slice(0, items.indexOf(item)).find((i) => sameChain(i, item) && (i.state === "failed" || isTooOld(i, now)));
  if (before) return { state: "blocked", why: `Waits for “${before.label}” of ${before.ref}, which was not sent` };
  return { state: item.state };
}

/**
 * The next item to send: the oldest one still waiting, of the signed-in user, not too old, and
 * not behind a failed or too old item of the same position (the order of one position's steps
 * matters; other positions go on).
 */
export function nextSendable(items: QueueItem[], now: Date, userId: string | undefined, skip: ReadonlySet<string> = new Set()): QueueItem | undefined {
  return items.find((i) => i.state === "waiting" && !skip.has(i.id) && itemStatus(items, i, now, userId).state === "waiting");
}

/**
 * Items this phone will still send (all but failed, too old and another user's held ones), for
 * "Waiting to send (n)". Those others stay in the list, where each says why it waits.
 */
export const waitingCount = (items: QueueItem[], now: Date, userId: string | undefined) =>
  items.filter((i) => {
    const s = itemStatus(items, i, now, userId).state;
    return s !== "failed" && s !== "too_old" && s !== "held_user";
  }).length;

// ─── Sending ───────────────────────────────────────────────────

/** Server outcomes that mean "done": the write is there (now or from before), nothing to repeat. */
export type SentOutcome =
  | "stamped"
  | "already_stamped"
  | "stamped_by_someone_else"
  | "saved"
  | "already_saved"
  | "newer_exists"
  | "recorded"
  | "already_recorded"
  | "uploaded"
  // Container actions (tally, stuffed, container stamps).
  | "done"
  | "already_done"
  | "done_by_someone_else";

export type SendResult =
  | { type: "done"; outcome: SentOutcome; notice?: string; fileId?: string }
  /** No connection (or the server is down for a moment): stays waiting, tried again later. */
  | { type: "offline"; error: string }
  /** Signed out / expired: the queue pauses until the user signs in again. */
  | { type: "auth"; error: string }
  /** The server refused it: it stays in the list as failed for the user to try again or discard. */
  | { type: "refused"; error: string }
  /** Not sent yet for a reason on the phone (an exception whose photos are still queued): stays waiting, the others go on. */
  | { type: "deferred"; error: string };

type ErrorLike = { status?: number; code?: string; message?: string; name?: string };

/** Sorts an error of a call: no connection, signed out, or refused by the server. */
export function classifyError(e: unknown): Exclude<SendResult, { type: "done" | "deferred" }> {
  const err = (e ?? {}) as ErrorLike;
  const message = typeof err.message === "string" ? err.message : String(e);
  // fetch fails with a TypeError when there is no network (and our time limit throws one too); an
  // aborted call is an AbortError / TimeoutError. The API client's errors carry a status. Anything
  // else (a bug, a photo that cannot be read) is not a connection problem: it is refused, so it
  // shows as failed instead of being retried for ever behind an "offline" banner.
  if (typeof err.status !== "number") {
    if (e instanceof TypeError || err.name === "TypeError" || err.name === "AbortError" || err.name === "TimeoutError" || err.name === "NetworkError") {
      return { type: "offline", error: "No connection" };
    }
    return { type: "refused", error: message && message !== "[object Object]" ? message : "Could not be sent from this phone" };
  }
  if (err.status === 401 || err.code === "unauthenticated") return { type: "auth", error: "Signed out — sign in again to send" };
  if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504 || err.code === "unavailable") {
    return { type: "offline", error: "The server cannot be reached" };
  }
  return { type: "refused", error: message || "Refused by the server" };
}

/** The item list after a send: done items leave it; others are marked. Also the words to show. */
export function onResult(items: QueueItem[], id: string, result: SendResult): { items: QueueItem[]; message: { tone: "success" | "info" | "warning" | "error"; text: string } | null } {
  const item = items.find((i) => i.id === id);
  if (!item) return { items, message: null };
  switch (result.type) {
    case "done": {
      const left = items.filter((i) => i.id !== id);
      const notice = result.notice?.trim();
      if (result.outcome === "newer_exists") return { items: left, message: { tone: "warning", text: notice || `${item.label} of ${item.ref}: a later survey is kept` } };
      if (result.outcome.endsWith("_by_someone_else") || result.outcome.startsWith("already")) {
        return { items: left, message: { tone: "info", text: notice || `${item.label} of ${item.ref} was already there` } };
      }
      return { items: left, message: null };
    }
    case "offline":
      return { items: items.map((i) => (i.id === id ? { ...i, state: "waiting" as const, attempts: i.attempts + 1, error: result.error } : i)), message: null };
    case "auth":
    case "deferred":
      return { items: items.map((i) => (i.id === id ? { ...i, state: "waiting" as const, error: result.error } : i)), message: null };
    case "refused":
      return {
        items: items.map((i) => (i.id === id ? { ...i, state: "failed" as const, attempts: i.attempts + 1, error: result.error } : i)),
        message: { tone: "error", text: `${item.label} of ${item.ref} was not sent: ${result.error}` },
      };
  }
}

/**
 * What to write to storage to go from `prev` to `next`: items that are new or changed (a changed
 * item is a new object) and ids that left. Storage is written item by item, never as a whole
 * list, so two tabs (or an old and a new page) cannot wipe each other's items.
 */
export function queueDiff(prev: QueueItem[], next: QueueItem[]): { put: QueueItem[]; remove: string[] } {
  const before = new Map(prev.map((i) => [i.id, i]));
  const ids = new Set(next.map((i) => i.id));
  return { put: next.filter((i) => before.get(i.id) !== i), remove: prev.filter((i) => !ids.has(i.id)).map((i) => i.id) };
}

/** A diff applied to a stored list (localStorage fallback, read just before writing). */
export function applyDiff(stored: QueueItem[], diff: { put: QueueItem[]; remove: string[] }): QueueItem[] {
  const gone = new Set(diff.remove);
  const put = new Map(diff.put.map((i) => [i.id, i]));
  const kept = stored.filter((i) => !gone.has(i.id) && !put.has(i.id));
  return sortQueue([...kept, ...diff.put]);
}

/** Oldest first, as the queue is sent. */
export const sortQueue = (items: QueueItem[]): QueueItem[] => [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.recordedAt.localeCompare(b.recordedAt));

/**
 * The list a tab holds after reading storage: storage is the truth (another tab may have sent or
 * queued items), except for ids this tab changed whose write has not reached storage yet
 * (`unsaved`): there this tab's copy (or its removal) wins.
 */
export function mergeStored(stored: QueueItem[], local: QueueItem[], unsaved: ReadonlySet<string>): QueueItem[] {
  const have = new Set(stored.map((i) => i.id));
  const localById = new Map(local.map((i) => [i.id, i]));
  // An unsaved id this tab no longer holds was sent or discarded here: its stored copy is stale.
  const merged = stored.flatMap((i) => (!unsaved.has(i.id) ? [i] : localById.has(i.id) ? [localById.get(i.id)!] : []));
  return sortQueue([...merged, ...local.filter((i) => unsaved.has(i.id) && !have.has(i.id))]);
}

/** Sets a failed item back to waiting ("Try again"). */
export const retryItem = (items: QueueItem[], id: string): QueueItem[] => items.map((i) => (i.id === id && i.state === "failed" ? { ...i, state: "waiting" as const, error: undefined } : i));

/** Items left "sending" when the page closed mid-send are waiting again (the server knows them by id). */
export const resumeAfterReload = (items: QueueItem[]): QueueItem[] => items.map((i) => (i.state === "sending" ? { ...i, state: "waiting" as const } : i));

/**
 * Photo ids of an exception as the server knows them: local ids of queued photos are swapped for
 * the server id once the photo is uploaded. `pending` are local photos not uploaded yet (the
 * exception waits); `lost` are local photos that are no longer queued nor uploaded (discarded).
 */
export function resolvePhotoIds(fileIds: string[], uploaded: Record<string, string>, items: QueueItem[]): { ids: string[]; pending: string[]; lost: string[] } {
  const ids: string[] = [];
  const pending: string[] = [];
  const lost: string[] = [];
  for (const f of fileIds) {
    if (!f.startsWith(LOCAL_PHOTO)) ids.push(f);
    else {
      const local = f.slice(LOCAL_PHOTO.length);
      if (uploaded[local]) ids.push(uploaded[local]!);
      else if (items.some((i) => i.id === local && i.kind === "photo")) pending.push(local);
      else lost.push(local);
    }
  }
  return { ids, pending, lost };
}

// ─── What the screen shows before the server answers ───────────

/** The tally ticks / stuffed marks / container stamps of a container still waiting to be sent. */
export const pendingInContainer = (items: QueueItem[], containerId: string) =>
  items.filter((i) => i.containerId === containerId && i.state !== "failed" && (i.kind === "tally" || i.kind === "stuffed" || i.kind === "containerStamp"));

/** A re-weigh of the position waiting to be sent (the latest), if any. */
export const pendingReweigh = (items: QueueItem[], movementId: string) =>
  [...items].reverse().find((i): i is Extract<QueueItem, { kind: "reweigh" }> => i.kind === "reweigh" && i.movementId === movementId && i.state !== "failed");

/** The stamp kinds of a position still waiting to be sent. */
export const pendingStamps = (items: QueueItem[], movementId: string): StepKind[] =>
  items.flatMap((i) => (i.kind === "stamp" && i.movementId === movementId && i.state !== "failed" ? [i.payload.kind] : []));

/**
 * The movement as the floor screen shows it with its queued writes applied: stamps carry the time
 * they were made, surveys replace the stored one of that container and pass, exceptions are open.
 * Failed items are not applied. The server's answer replaces all of it once they are sent.
 */
export function applyPending<M extends Pick<Movement, "id" | "surveys" | "exceptions" | "openExceptions" | StepKind | "status"> & Partial<Pick<Movement, "reweigh" | "reweighs" | "container" | "receivedAt">>>(
  m: M,
  items: QueueItem[],
): M {
  const mine = items.filter((i) => i.movementId === m.id && i.state !== "failed");
  if (!mine.length) return m;
  const next: M = { ...m, surveys: [...m.surveys], exceptions: [...m.exceptions] };
  for (const i of mine) {
    if (i.kind === "stamp") {
      const k = i.payload.kind;
      if (!next[k]) (next as Record<StepKind, string | null>)[k] = i.recordedAt;
      if (k === "gateIn" && next.status === "Expected") next.status = "In Warehouse";
    } else if (i.kind === "survey") {
      const s = i.payload.survey;
      const phase = surveyPhaseKey(s.phase);
      const at = next.surveys.findIndex((x) => x.container === s.container && surveyPhaseKey(x.phase) === phase);
      const stored = at >= 0 ? next.surveys[at] : undefined;
      // The later of the two wins, as on the server.
      if (stored?.surveyedAt && new Date(stored.surveyedAt).getTime() > new Date(i.recordedAt).getTime()) continue;
      const row = { ...s, surveyedAt: i.recordedAt, surveyedBy: `${i.userName} · waiting to send` };
      if (at >= 0) next.surveys[at] = row;
      else next.surveys.push(row);
    } else if (i.kind === "exception") {
      const e = i.payload.exception;
      next.exceptions.push({
        id: `${LOCAL_PHOTO}${i.id}`,
        movementId: m.id,
        taskId: null,
        type: e.type,
        pieces: e.pieces,
        note: e.note ?? "",
        container: e.container ?? "",
        surveyPhase: e.surveyPhase ?? "",
        source: e.source ?? "manual",
        fileIds: e.fileIds ?? [],
        status: "open",
        createdAt: i.recordedAt,
        createdBy: `${i.userName} · waiting to send`,
        resolvedAt: null,
        resolvedBy: "",
        resolutionNote: "",
      });
      next.openExceptions += 1;
    } else if (i.kind === "reweigh") {
      // A queued re-weigh counts on the phone (the receipt may be stamped behind it: the queue
      // keeps the order, so the server sees the re-weigh first).
      const r: interfaces.GateReweighItem = {
        id: `${LOCAL_PHOTO}${i.id}`,
        movementId: m.id,
        weighedKg: i.payload.reweigh.weighedKg,
        declaredKg: null,
        declaredSource: "",
        variancePct: null,
        flagged: false,
        weighedBy: `${i.userName} · waiting to send`,
        weighedAt: i.recordedAt,
        fileIds: i.payload.reweigh.fileIds,
        note: i.payload.reweigh.note,
        createdAt: i.recordedAt,
      };
      next.reweigh = r;
      next.reweighs = [r, ...(next.reweighs ?? [])];
    } else if (i.kind === "tally" && next.container && next.container.id === i.payload.containerId && !next.container.tallyOutcome) {
      next.container = {
        ...next.container,
        tallyOutcome: i.payload.tally.outcome,
        tallyPieces: i.payload.tally.pieces ?? null,
        tickedAt: i.recordedAt,
        tickedBy: `${i.userName} · waiting to send`,
      };
      if (i.payload.tally.outcome === "received" && !next.receivedAt) next.receivedAt = i.recordedAt;
    } else if (i.kind === "stuffed" && next.container && next.container.id === i.payload.containerId) {
      next.container = { ...next.container, stuffedAt: i.payload.stuffed ? i.recordedAt : null, stuffedBy: i.payload.stuffed ? `${i.userName} · waiting to send` : "" };
    }
  }
  return next;
}

/**
 * The container as the floor screen shows it with its queued writes applied: its gate-in / start
 * of stripping, the houses ticked or stuffed and re-weighed on the phone. The server's answer
 * replaces it once they are sent.
 */
export function applyPendingContainer(c: Container, items: QueueItem[]): Container {
  const mine = items.filter((i) => i.state !== "failed" && (i.containerId === c.id || (i.kind === "reweigh" && c.positions.some((h) => h.movementId === i.movementId))));
  if (!mine.length) return c;
  const next: Container = { ...c, positions: c.positions.map((h) => ({ ...h })) };
  const by = (i: QueueItem) => `${i.userName} · waiting to send`;
  for (const i of mine) {
    const h = next.positions.find((x) => x.movementId === i.movementId);
    if (i.kind === "containerStamp") {
      if (i.payload.kind === "gateIn" && !next.gateInAt) next.gateInAt = i.recordedAt;
      if (i.payload.kind === "strippingStart" && !next.strippingStartedAt) next.strippingStartedAt = i.recordedAt;
    } else if (i.kind === "tally" && h && !h.tallyOutcome) {
      const t = i.payload.tally;
      Object.assign(h, {
        tallyOutcome: t.outcome,
        tallyPieces: t.pieces ?? null,
        tallyCondition: t.condition ?? "",
        tallyLocation: t.location ?? "",
        tallyNote: t.note ?? "",
        tallyReason: t.reason ?? "",
        tickedAt: i.recordedAt,
        tickedBy: by(i),
      });
      if (!next.strippingStartedAt) next.strippingStartedAt = i.recordedAt;
    } else if (i.kind === "stuffed" && h) {
      Object.assign(h, { stuffedAt: i.payload.stuffed ? i.recordedAt : null, stuffedBy: i.payload.stuffed ? by(i) : "" });
    } else if (i.kind === "reweigh" && h) {
      Object.assign(h, { reweighKg: i.payload.reweigh.weighedKg, reweighFlagged: false });
    }
  }
  return next;
}
