"use client";

import { applyDiff, sortQueue, type QueueItem } from "./queue";

// Where floor mode keeps its queue on the phone: IndexedDB (items, photo bytes as Blobs, and the
// ids the server gave uploaded photos). When IndexedDB cannot be opened (private window, blocked
// site data) items fall back to localStorage — photos cannot, they need IndexedDB. Every call is
// wrapped: storage that fails never breaks the page; the caller is told what was not kept.

const DB_NAME = "warehouse-floor";
const DB_VERSION = 1;
const ITEMS = "queue";
const BLOBS = "blobs";
const META = "meta";
const LS_KEY = "warehouse-floor-queue";
const LS_PHOTOS = "warehouse-floor-photo-ids";

export type StoredQueue = { items: QueueItem[]; photoIds: Record<string, string> };

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const t = db.transaction(store, mode);
      const req = run(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    } catch (e) {
      reject(e);
    }
  });
}

const lsRead = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const lsWrite = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** The queue as stored, oldest first. */
export async function loadQueue(): Promise<StoredQueue> {
  const db = await openDb();
  if (!db) return { items: lsRead<QueueItem[]>(LS_KEY, []), photoIds: lsRead<Record<string, string>>(LS_PHOTOS, {}) };
  try {
    const [items, photoIds] = await Promise.all([
      tx<QueueItem[]>(db, ITEMS, "readonly", (s) => s.getAll() as IDBRequest<QueueItem[]>),
      tx<Record<string, string>>(db, META, "readonly", (s) => s.get("photoIds") as IDBRequest<Record<string, string>>),
    ]);
    return { items: sortQueue(items ?? []), photoIds: photoIds ?? {} };
  } catch {
    return { items: [], photoIds: {} };
  }
}

/**
 * Writes what changed, item by item (put the new / changed ones, delete the ones that left), so
 * a tab never wipes items another tab queued. True when it was kept. Other tabs are told.
 */
export async function saveChanges(diff: { put: QueueItem[]; remove: string[] }): Promise<boolean> {
  if (!diff.put.length && !diff.remove.length) return true;
  const db = await openDb();
  let ok: boolean;
  if (!db) {
    // localStorage: read just before writing, so another tab's items are kept.
    ok = lsWrite(LS_KEY, applyDiff(lsRead<QueueItem[]>(LS_KEY, []), diff));
  } else {
    try {
      await tx(db, ITEMS, "readwrite", (s) => {
        for (const id of diff.remove) s.delete(id);
        for (const i of diff.put) s.put(i);
      });
      ok = true;
    } catch {
      ok = false;
    }
  }
  announce();
  return ok;
}

/** Records the server id of one uploaded photo, merged with what is stored (another tab may have added some). */
export async function savePhotoId(localId: string, serverId: string): Promise<boolean> {
  const db = await openDb();
  let ok: boolean;
  if (!db) ok = lsWrite(LS_PHOTOS, { ...lsRead<Record<string, string>>(LS_PHOTOS, {}), [localId]: serverId });
  else {
    try {
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(META, "readwrite");
        const store = t.objectStore(META);
        const get = store.get("photoIds");
        get.onsuccess = () => store.put({ ...((get.result as Record<string, string> | undefined) ?? {}), [localId]: serverId }, "photoIds");
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
      ok = true;
    } catch {
      ok = false;
    }
  }
  announce();
  return ok;
}

// ─── Other tabs ────────────────────────────────────────────────
// A tab that changed the stored queue tells the others, which read it again.

const CHANNEL = "warehouse-floor-queue";
let channel: BroadcastChannel | null | undefined;
const getChannel = () => {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    channel = null;
  }
  return channel;
};
function announce() {
  try {
    getChannel()?.postMessage("changed");
  } catch {
    // No other tab told: it reads the queue again when shown.
  }
}
/** Calls `onChange` when another tab changed the stored queue; returns the unsubscribe. */
export function onOtherTabChange(onChange: () => void): () => void {
  const ch = getChannel();
  const onMsg = () => onChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY || e.key === LS_PHOTOS) onChange();
  };
  try {
    ch?.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);
  } catch {
    // Nothing to listen to.
  }
  return () => {
    try {
      ch?.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
    } catch {
      // Gone already.
    }
  };
}

/** Why a photo could not be kept for later, or null when it was. */
export type PhotoKeepError = "no_storage" | "full";

/**
 * Keeps a photo's bytes until it is sent. Checks the space the browser gives this site first and
 * catches a full storage (QuotaExceededError).
 */
export async function putPhoto(id: string, blob: Blob): Promise<PhotoKeepError | null> {
  const db = await openDb();
  if (!db) return "no_storage";
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota != null && est.usage != null && est.quota - est.usage < blob.size * 2) return "full";
  } catch {
    // No estimate: just try.
  }
  try {
    await tx(db, BLOBS, "readwrite", (s) => s.put(blob, id));
    return null;
  } catch (e) {
    return (e as { name?: string })?.name === "QuotaExceededError" ? "full" : "no_storage";
  }
}

export async function getPhoto(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return ((await tx<Blob>(db, BLOBS, "readonly", (s) => s.get(id) as IDBRequest<Blob>)) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Frees a photo's bytes once it is uploaded (or the user discarded it). */
export async function dropPhoto(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, BLOBS, "readwrite", (s) => s.delete(id));
  } catch {
    // Left behind: harmless, it is overwritten by nothing and small next to the quota.
  }
}
