"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { gateKeys, invalidateAfterGateEvent, useGateRowCache, type GateMovement } from "@/hooks/useGateLog";
import { fileToBase64 } from "@/lib/files";
import { containerKey, type WarehouseContainer } from "@/hooks/useWarehouseRecords";
import {
  classifyError,
  containerChain,
  enqueue,
  itemStatus,
  mergeStored,
  nextSendable,
  onResult,
  queueDiff,
  resolvePhotoIds,
  resumeAfterReload,
  retryItem,
  sameChain,
  uuid,
  type ItemStatus,
  type QueueItem,
  type SendResult,
  waitingCount,
} from "./queue";
import { dropPhoto, getPhoto, loadQueue, onOtherTabChange, putPhoto, saveChanges, savePhotoId } from "./queueStore";

// Sends floor mode's writes: straight away when the phone is online, into the queue when it is
// not (or the call fails for want of a connection), and the queue in order once it is back.
// Only stamps that may wait (QUEUEABLE_STAMPS), survey saves, exceptions, photos, re-weighs and a
// container's tally ticks, stuffed marks and gate-in / start of stripping come here; the PIN
// check, the WH release, a container's close and gate-out and the other server decisions are
// called directly and need a connection.

const CALL_TIMEOUT_MS = 20_000;
const PHOTO_TIMEOUT_MS = 90_000;
const RETRY_EVERY_MS = 30_000;

/** A house of a container (or the container itself): the position it is for and its ref. */
export type FloorHouse = { movementId: string; ref: string };

type Payload<K extends QueueItem["kind"]> = Extract<QueueItem, { kind: K }>["payload"];

/** A write as the screen hands it over; who, when and its id are added here. */
export type FloorWrite =
  | { kind: "stamp"; movement: GateMovement; label: string; payload: Payload<"stamp"> }
  | { kind: "survey"; movement: GateMovement; label: string; payload: Payload<"survey"> }
  | { kind: "exception"; movement: GateMovement; label: string; payload: Payload<"exception"> }
  | { kind: "photo"; movement: GateMovement | FloorHouse; label: string; payload: Payload<"photo">; blob: Blob }
  | { kind: "reweigh"; movement: GateMovement | FloorHouse; label: string; payload: Payload<"reweigh"> }
  | { kind: "tally"; movement: FloorHouse; label: string; payload: Payload<"tally"> }
  | { kind: "stuffed"; movement: FloorHouse; label: string; payload: Payload<"stuffed"> }
  /** A container's own stamp: `movement` is ignored (the container is its key). */
  | { kind: "containerStamp"; movement?: undefined; label: string; payload: Payload<"containerStamp"> };

const targetOf = (w: FloorWrite): { movementId: string; ref: string; containerId?: string } => {
  if (w.kind === "containerStamp") return { movementId: containerChain(w.payload.containerId), ref: w.payload.containerNumber, containerId: w.payload.containerId };
  const m = w.movement;
  const t = "id" in m ? { movementId: m.id, ref: m.positionRef || m.gateRef } : { movementId: m.movementId, ref: m.ref };
  if (w.kind === "tally" || w.kind === "stuffed") return { ...t, containerId: w.payload.containerId };
  // A re-weigh of a house in an import container waits for that container's gate-in (same chain):
  // the server takes it only after the container has arrived.
  if (w.kind === "reweigh" && "id" in m && m.container?.kind === "import") return { ...t, containerId: m.container.id };
  return t;
};

export type SubmitResult =
  | { type: "sent"; outcome: string; notice: string; fileId?: string }
  /**
   * Kept on the phone; sent when back online. `id` is the queue item's (photos: use `local:<id>`).
   * `notSaved`: the phone's storage refused it, so it is held only while this page stays open (the
   * shell shows a persistent warning; it must not be recorded again, it is still queued).
   */
  | { type: "queued"; id: string; recordedAt: string; notSaved?: boolean }
  | { type: "refused"; error: string }
  /** Could not even be kept on the phone (photo storage full / unavailable). */
  | { type: "not_kept"; error: string };

type FloorQueue = {
  items: QueueItem[];
  online: boolean;
  /** Signed out while items wait. */
  authPaused: boolean;
  sending: boolean;
  submit: (w: FloorWrite) => Promise<SubmitResult>;
  flush: () => void;
  retry: (id: string) => void;
  discard: (id: string) => Promise<void>;
  statusOf: (item: QueueItem) => ItemStatus;
  /** Items this phone will still send (see waitingCount). */
  waiting: number;
  /** A write could not be kept in this phone's storage: it lives only until the page closes. */
  notSaved: boolean;
  /** Marks a call that failed for want of a connection (e.g. a PIN check), so the screen shows offline. */
  noteNetworkError: (e: unknown) => boolean;
};

const Ctx = createContext<FloorQueue | null>(null);

export function useFloorQueue(): FloorQueue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFloorQueue outside FloorQueueProvider");
  return ctx;
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new TypeError("timeout")), ms))]);

export function FloorQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  // The toast helpers are new on every render; read them through a ref so the sender stays put.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const queryClient = useQueryClient();
  const writeRow = useGateRowCache();
  // A container action answers with the container: write it to the cache and read again what its
  // houses' gate events change (gate log, stock, bonded, KPIs, sections).
  const writeContainer = useCallback(
    (c: WarehouseContainer) => {
      queryClient.setQueryData(containerKey(c.id), c);
      void invalidateAfterGateEvent(queryClient);
    },
    [queryClient],
  );
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const photoIds = useRef<Record<string, string>>({});
  const [navOnline, setNavOnline] = useState(true);
  const [netDown, setNetDown] = useState(false);
  const [authPaused, setAuthPaused] = useState(false);
  const [sending, setSending] = useState(false);
  const [notSaved, setNotSaved] = useState(false);
  const flushing = useRef(false);
  // Writes sent straight away and not answered yet: a later write of the same chain waits behind
  // them, so a slow direct send that ends up queued can't be overtaken.
  const inFlight = useRef(new Set<QueueItem>());
  const [now, setNow] = useState(() => new Date());

  // Storage is written item by item, one write after the other (a chain), and read through the
  // same chain, so a read never misses this tab's own earlier writes. `unsaved` counts this tab's
  // writes per id that have not reached storage yet: for those, this tab's copy wins over a read.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const unsaved = useRef(new Map<string, number>());
  // Resolves with whether the change reached storage (false: kept in memory only).
  const commit = useCallback((next: QueueItem[]): Promise<boolean> => {
    const diff = queueDiff(itemsRef.current, next);
    itemsRef.current = next;
    setItems(next);
    const ids = [...diff.put.map((i) => i.id), ...diff.remove];
    if (!ids.length) return Promise.resolve(true);
    for (const id of ids) unsaved.current.set(id, (unsaved.current.get(id) ?? 0) + 1);
    const saved = chain.current.then(() => saveChanges(diff)).catch(() => false);
    chain.current = saved.finally(() => {
        for (const id of ids) {
          const n = (unsaved.current.get(id) ?? 1) - 1;
          if (n > 0) unsaved.current.set(id, n);
          else unsaved.current.delete(id);
        }
      });
    return saved;
  }, []);

  /** Reads the stored queue again (another tab may have queued or sent items). */
  const reload = useCallback((first = false) => {
    const read = chain.current.then(() => loadQueue());
    chain.current = read.catch(() => undefined);
    return read
      .then(({ items: stored, photoIds: ids }) => {
        photoIds.current = { ...ids, ...photoIds.current };
        // On opening, items left "sending" by a page that closed mid-send are waiting again.
        const merged = mergeStored(first ? resumeAfterReload(stored) : stored, itemsRef.current, new Set(unsaved.current.keys()));
        itemsRef.current = merged;
        setItems(merged);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void reload(true);
    const offTabs = onOtherTabChange(() => void reload());
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    const up = () => setNavOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      offTabs();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
      clearInterval(tick);
    };
  }, [reload]);

  // A new sign-in may send again.
  useEffect(() => setAuthPaused(false), [user?.id]);

  const sawResult = useCallback((r: SendResult) => {
    if (r.type === "offline") setNetDown(true);
    else if (r.type === "auth") setAuthPaused(true);
    else if (r.type === "deferred") return;
    else {
      setNetDown(false);
      setAuthPaused(false);
    }
  }, []);

  /** One call to the server for an item; `direct` = sent right after it was made (server time). */
  const send = useCallback(
    async (item: QueueItem, direct: boolean, blob?: Blob): Promise<SendResult> => {
      const recordedAt = direct ? undefined : item.recordedAt;
      try {
        switch (item.kind) {
          case "stamp": {
            const res = await withTimeout(
              api.warehouse.gateMovementStamp(item.movementId, { kind: item.payload.kind, clientRequestId: item.id, recordedAt }),
              CALL_TIMEOUT_MS,
            );
            writeRow(res.movement);
            void invalidateAfterGateEvent(queryClient);
            return { type: "done", outcome: res.outcome, notice: res.notice };
          }
          case "survey": {
            const res = await withTimeout(
              api.warehouse.gateMovementSaveSurvey(item.movementId, { survey: item.payload.survey, clientRequestId: item.id, recordedAt }),
              CALL_TIMEOUT_MS,
            );
            writeRow(res.movement);
            return { type: "done", outcome: res.outcome, notice: res.notice };
          }
          case "exception": {
            const files = resolvePhotoIds(item.payload.exception.fileIds ?? [], photoIds.current, itemsRef.current);
            if (files.pending.length) return { type: "deferred", error: "Waiting for its photos to be sent" };
            const res = await withTimeout(
              api.warehouse.gateExceptionCreate(item.movementId, {
                exception: { ...item.payload.exception, fileIds: files.ids, clientRequestId: item.id, recordedAt },
              }),
              CALL_TIMEOUT_MS,
            );
            writeRow(res.movement);
            const lost = files.lost.length ? ` (${files.lost.length} photo${files.lost.length === 1 ? " was" : "s were"} discarded and not attached)` : "";
            return { type: "done", outcome: res.outcome, notice: res.notice ? `${res.notice}${lost}` : lost.trim() };
          }
          case "photo": {
            const bytes = blob ?? (await getPhoto(item.id));
            if (!bytes) return { type: "refused", error: "The photo is no longer on this phone — take it again" };
            const contentBase64 = await fileToBase64(bytes);
            const res = await withTimeout(
              api.warehouse.gateFileUpload(item.movementId, {
                fileName: item.payload.fileName,
                fileType: item.payload.fileType,
                contentBase64,
                container: item.payload.container,
                tag: item.payload.tag,
                clientRequestId: item.id,
              }),
              PHOTO_TIMEOUT_MS,
            );
            photoIds.current = { ...photoIds.current, [item.id]: res.file.id };
            void savePhotoId(item.id, res.file.id);
            void dropPhoto(item.id);
            queryClient.invalidateQueries({ queryKey: gateKeys.files(item.movementId) });
            return { type: "done", outcome: "uploaded", fileId: res.file.id };
          }
          case "reweigh": {
            const files = resolvePhotoIds(item.payload.reweigh.fileIds, photoIds.current, itemsRef.current);
            if (files.pending.length) return { type: "deferred", error: "Waiting for its photos to be sent" };
            const res = await withTimeout(
              api.warehouse.gateMovementReweigh(item.movementId, {
                reweigh: { weighedKg: item.payload.reweigh.weighedKg, note: item.payload.reweigh.note, fileIds: files.ids, clientRequestId: item.id, recordedAt },
              }),
              CALL_TIMEOUT_MS,
            );
            writeRow(res.movement);
            void invalidateAfterGateEvent(queryClient);
            return { type: "done", outcome: res.outcome, notice: res.notice };
          }
          case "tally": {
            const res = await withTimeout(
              api.warehouse.warehouseContainerTally(item.payload.containerId, item.movementId, { tally: item.payload.tally, clientRequestId: item.id, recordedAt }),
              CALL_TIMEOUT_MS,
            );
            writeContainer(res.container);
            return { type: "done", outcome: res.outcome, notice: res.notice };
          }
          case "stuffed": {
            const res = await withTimeout(
              api.warehouse.warehouseContainerSetStuffed(item.payload.containerId, item.movementId, { stuffed: item.payload.stuffed, clientRequestId: item.id, recordedAt }),
              CALL_TIMEOUT_MS,
            );
            writeContainer(res.container);
            return { type: "done", outcome: res.outcome, notice: res.notice };
          }
          case "containerStamp": {
            const res = await withTimeout(
              api.warehouse.warehouseContainerStamp(item.payload.containerId, { kind: item.payload.kind, clientRequestId: item.id, recordedAt }),
              CALL_TIMEOUT_MS,
            );
            writeContainer(res.container);
            return { type: "done", outcome: res.outcome, notice: res.notice };
          }
        }
      } catch (e) {
        return classifyError(e);
      }
    },
    [queryClient, writeRow, writeContainer],
  );

  const flushNow = useCallback(async (holdsLock: boolean) => {
    if (flushing.current || !user) return;
    flushing.current = true;
    setSending(true);
    try {
      // Holding the lock, no other tab is sending: an item still marked "sending" was left by a
      // tab that closed mid-send, and is waiting again (the server knows it by its id).
      if (holdsLock && itemsRef.current.some((i) => i.state === "sending")) commit(resumeAfterReload(itemsRef.current));
      // Items put off this round (an exception waiting for its photos) are skipped, not retried in a loop.
      const skip = new Set<string>();
      for (let guard = 0; guard < 200; guard++) {
        const next = nextSendable(itemsRef.current, new Date(), user.id, skip);
        if (!next) break;
        commit(itemsRef.current.map((i) => (i.id === next.id ? { ...i, state: "sending" as const } : i)));
        const result = await send(next, false);
        sawResult(result);
        const after = onResult(itemsRef.current, next.id, result);
        commit(after.items);
        if (after.message) toastRef.current[after.message.tone](after.message.text);
        if (result.type === "deferred") skip.add(next.id);
        if (result.type === "offline" || result.type === "auth") break;
      }
    } finally {
      flushing.current = false;
      setSending(false);
    }
  }, [commit, send, sawResult, user]);

  // One tab sends at a time where the browser can tell (Web Locks); the server ignores repeats anyway.
  const flush = useCallback(() => {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks?.request) {
      locks.request("warehouse-floor-queue", { ifAvailable: true }, async (lock) => (lock ? flushNow(true) : undefined)).catch(() => flushNow(false));
    } else void flushNow(false);
  }, [flushNow]);

  // Send when the connection comes back, when the phone shows the page again, and every 30 s while items wait.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload().then(flush);
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush, reload]);
  const hasItems = items.length > 0;
  useEffect(() => {
    if (!hasItems) return;
    flush();
    const t = setInterval(flush, RETRY_EVERY_MS);
    return () => clearInterval(t);
  }, [hasItems, flush, user?.id]);

  // After a failed call, look every 15 s whether the server answers again (reading the Gate Log,
  // which also refreshes it).
  useEffect(() => {
    if (!netDown || !navOnline) return;
    const t = setInterval(() => {
      withTimeout(api.warehouse.gateMovementList({}), CALL_TIMEOUT_MS)
        .then((res) => {
          queryClient.setQueryData(gateKeys.list(), res);
          setNetDown(false);
          flush();
        })
        .catch(() => undefined);
    }, 15_000);
    return () => clearInterval(t);
  }, [netDown, navOnline, queryClient, flush]);

  const online = navOnline && !netDown;

  const submit = useCallback(
    async (w: FloorWrite): Promise<SubmitResult> => {
      if (!user) return { type: "refused", error: "Sign in first" };
      const at = new Date().toISOString();
      const target = targetOf(w);
      const item = {
        id: uuid(),
        userId: user.id,
        userName: user.displayName || user.email,
        movementId: target.movementId,
        ...(target.containerId ? { containerId: target.containerId } : {}),
        ref: target.ref,
        label: w.label,
        recordedAt: at,
        createdAt: at,
        state: "waiting",
        attempts: 0,
        kind: w.kind,
        payload: w.payload,
      } as QueueItem;
      // Straight away when online and nothing of this position waits before it (the order of a
      // position's writes is kept).
      const behind = itemsRef.current.some((i) => sameChain(i, item)) || [...inFlight.current].some((i) => sameChain(i, item));
      if (navigator.onLine && !netDown && !behind) {
        inFlight.current.add(item);
        let result: SendResult;
        try {
          result = await send(item, true, w.kind === "photo" ? w.blob : undefined);
        } finally {
          inFlight.current.delete(item);
        }
        sawResult(result);
        if (result.type === "done") {
          if (itemsRef.current.length) flush();
          return { type: "sent", outcome: result.outcome, notice: result.notice ?? "", fileId: result.fileId };
        }
        if (result.type === "refused") return { type: "refused", error: result.error };
        // No connection (or signed out): keep it and send it later, with the time it was made.
      }
      if (w.kind === "photo") {
        const kept = await putPhoto(item.id, w.blob);
        if (kept === "full") return { type: "not_kept", error: "Phone storage full — photo not saved. Take it again when back online." };
        if (kept) return { type: "not_kept", error: "This browser cannot keep photos offline — take it again when back online." };
      }
      const saved = await commit(enqueue(itemsRef.current, item));
      flush();
      if (!saved) setNotSaved(true);
      return { type: "queued", id: item.id, recordedAt: at, ...(saved ? {} : { notSaved: true }) };
    },
    [commit, flush, netDown, send, sawResult, user],
  );

  const retry = useCallback(
    (id: string) => {
      commit(retryItem(itemsRef.current, id));
      flush();
    },
    [commit, flush],
  );
  const discard = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      commit(itemsRef.current.filter((i) => i.id !== id));
      if (item?.kind === "photo") await dropPhoto(id);
    },
    [commit],
  );
  const statusOf = useCallback((item: QueueItem) => itemStatus(itemsRef.current, item, now, user?.id), [now, user?.id]);
  const waiting = useMemo(() => waitingCount(items, now, user?.id), [items, now, user?.id]);
  // Once everything is sent, nothing is left that only lives in memory.
  useEffect(() => {
    if (!items.length) setNotSaved(false);
  }, [items.length]);
  const noteNetworkError = useCallback(
    (e: unknown) => {
      const r = classifyError(e);
      if (r.type === "offline") setNetDown(true);
      return r.type === "offline";
    },
    [],
  );

  const value = useMemo<FloorQueue>(
    () => ({ items, online, authPaused, sending, submit, flush, retry, discard, statusOf, waiting, notSaved, noteNetworkError }),
    [items, online, authPaused, sending, submit, flush, retry, discard, statusOf, waiting, notSaved, noteNetworkError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
