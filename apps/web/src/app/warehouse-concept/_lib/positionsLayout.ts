// The Positions grid's saved layout (AppGrid storageKey). v3 (19 Nov 2026): browsers that opened Positions while
// the ETA Warehouse/HUB column was new stored their known columns with it already in - so AppGrid took it for one
// the user had hidden, and it never showed (its addedLater only counts on a layout saved without known columns).
// The key is moved once to v3, and the user's own layout goes with it: the columns shown in their order, and their
// column widths - but not the known columns, so the layout counts as saved before they were kept, and the column
// shows once, the user's other choices staying as they were (gridLayout legacyKnown).

/** The Positions grid's storage key now. */
export const POSITIONS_STORAGE_KEY = "warehouse:positions:v3";
/** The key the layouts were saved under before. */
export const POSITIONS_STORAGE_KEY_BEFORE = "warehouse:positions:v2";

type LayoutStore = Pick<Storage, "getItem" | "setItem" | "key" | "length">;

/**
 * Copies the user's Positions layout from the key before to v3, once: only while v3 has none of its own, so a
 * layout changed since is never written over. Its known columns stay behind (see above). Returns whether it copied.
 */
export function carryPositionsLayout(store: LayoutStore): boolean {
  const columns = `${POSITIONS_STORAGE_KEY}:columns`;
  if (store.getItem(columns) != null) return false;
  const before = store.getItem(`${POSITIONS_STORAGE_KEY_BEFORE}:columns`);
  if (before == null) return false;
  // Every user's widths on this browser (useColumnWidths keeps them per user id under the grid's key).
  const widthsBefore = `${POSITIONS_STORAGE_KEY_BEFORE}:columnWidths:`;
  const widths: [string, string][] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(widthsBefore)) continue;
    const value = store.getItem(key);
    const to = `${POSITIONS_STORAGE_KEY}:columnWidths:${key.slice(widthsBefore.length)}`;
    if (value != null && store.getItem(to) == null) widths.push([to, value]);
  }
  for (const [key, value] of widths) store.setItem(key, value);
  // The columns last: they mark the copy as done.
  store.setItem(columns, before);
  return true;
}

/** The copy in this browser, before the grid reads its layout; anything the storage refuses leaves the grid as new. */
export function carryPositionsLayoutHere(): void {
  try {
    if (typeof window !== "undefined") carryPositionsLayout(window.localStorage);
  } catch {
    // Storage blocked or full: the grid starts from its defaults.
  }
}
