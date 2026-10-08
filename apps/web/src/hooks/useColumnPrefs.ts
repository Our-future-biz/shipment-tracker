"use client";

import { useCallback, useEffect, useState } from "react";

// Default visible columns (columnConfig keys) — matches the original table.
export const DEFAULT_SHIPMENT_COLUMNS = [
  "jobNumber",
  "masterJob",
  "shipmentsDate",
  "shipmentsYear",
  "department",
  "personInCharge",
  "holidayCover",
  "customer",
  "customerPic",
];

/**
 * A column view other than the Shipments grid's own (e.g. the Warehouse overview): it keeps
 * its columns and active template under `scope` and starts from `defaults`, which must be
 * a stable array.
 */
export interface ColumnViewScope {
  scope: string;
  defaults: string[];
}

export function useColumnPrefs(userId: string | undefined, view?: ColumnViewScope) {
  const storageKey = userId ? (view ? `${view.scope}:columns:${userId}` : `shipmentColumns:${userId}`) : null;
  const defaults = view?.defaults ?? DEFAULT_SHIPMENT_COLUMNS;
  const [visible, setVisible] = useState<string[]>(defaults);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      setVisible(Array.isArray(parsed) && parsed.length > 0 ? parsed : defaults);
    } catch {
      setVisible(defaults);
    }
  }, [storageKey, defaults]);

  const save = useCallback(
    (keys: string[]) => {
      setVisible(keys);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(keys));
        } catch {
          /* ignore quota / unavailable */
        }
      }
    },
    [storageKey],
  );

  const reset = useCallback(() => save(defaults), [save, defaults]);

  return { visible, save, reset };
}
