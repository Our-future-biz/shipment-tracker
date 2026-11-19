// A grid's saved column layout (order + visibility) is the list of the columns shown. Saved with it is
// the list of every column the grid had then, so a column added to the grid later is told apart from
// one the user hid: the new one is shown once (at the end, if it is shown by default), the hidden one
// stays hidden. A layout saved before that list was kept knows the grid's columns but those the grid
// names as added after such layouts (legacyKnown).

export interface SavedColumnLayout {
  /** The columns shown, in order. */
  visible: string[];
  /** Every column the grid had when the layout was saved; null for a layout saved before this was kept. */
  known: string[] | null;
}

/**
 * The saved layout with the columns added since it was saved put at the end (those shown by default).
 * Columns the grid does not have now stay in the list, so one it shows only at times keeps its place;
 * the grid leaves them out when it draws.
 */
export function columnsFromLayout(saved: SavedColumnLayout, columns: { key: string; defaultVisible?: boolean }[], addedLater: readonly string[] = []): string[] {
  const known = new Set(saved.known ?? legacyKnown(columns, addedLater));
  const added = columns.filter((c) => !known.has(c.key) && c.defaultVisible !== false && !saved.visible.includes(c.key)).map((c) => c.key);
  return [...saved.visible, ...added];
}

/**
 * What a layout saved before the known columns were kept is taken to know (mock test council P7): the grid's
 * columns now, but those it says were added after such layouts (`addedLater`, e.g. Positions' ETA
 * Warehouse/HUB) - those show once, like any new column, and the user's other choices stay as they were. A grid
 * that names none leaves its old layouts as they were: it cannot tell a new column from a hidden one.
 */
export function legacyKnown(columns: { key: string }[], addedLater: readonly string[]): string[] {
  const later = new Set(addedLater);
  return columns.map((c) => c.key).filter((key) => !later.has(key));
}

/**
 * The known columns to store: those known before and the grid's columns now. A column the grid shows
 * only at times (e.g. once its data has loaded) stays known while it is away, so one the user hid
 * does not come back as new.
 */
export function knownColumns(before: string[] | null, columns: { key: string }[]): string[] {
  return [...new Set([...(before ?? []), ...columns.map((c) => c.key)])];
}

/** Reads a stored layout: the shown list, and the known list when it is there and well formed. */
export function parseColumnLayout(visibleJson: string | null, knownJson: string | null): SavedColumnLayout | null {
  const visible = parseKeyList(visibleJson);
  return visible ? { visible, known: parseKeyList(knownJson) } : null;
}

/** A stored list of column keys, or null when there is none or it is not one. */
export function parseKeyList(json: string | null): string[] | null {
  if (json == null) return null;
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) && v.every((k) => typeof k === "string") ? v : null;
  } catch {
    return null;
  }
}
