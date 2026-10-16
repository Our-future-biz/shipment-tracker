"use client";

import { Button } from "antd";

// Block C — one sticky bar for every unsaved edit of the tab (notes and remeasured lines): one
// save, one undo. Shown only while something is unsaved.
export function SaveBar({
  count,
  saving,
  blocked,
  onSave,
  onDiscard,
}: {
  count: number;
  saving: boolean;
  /** Why the save is held back (invalid values, saved meanwhile); null when it may go. */
  blocked: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-1 mt-1">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/95 backdrop-blur px-4 py-2.5 shadow-md">
        <span className="text-sm font-semibold text-amber-800">
          {count} unsaved change{count === 1 ? "" : "s"}
        </span>
        {blocked && <span className="text-xs text-amber-700">{blocked}</span>}
        <span className="ml-auto flex gap-2">
          <Button size="small" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
          <Button size="small" type="primary" onClick={onSave} loading={saving} disabled={!!blocked}>
            Save changes ({count})
          </Button>
        </span>
      </div>
    </div>
  );
}
