"use client";

import { useCallback, useEffect, useState } from "react";

// Default visible columns (columnConfig keys) — matches the original table.
export const DEFAULT_SHIPMENT_COLUMNS = [
  "jobNumber",
  "masterJob",
  "shipmentsDate",
  "department",
  "personInCharge",
  "holidayCover",
  "customer",
  "customerPic",
];

export function useColumnPrefs(userId: string | undefined) {
  const storageKey = userId ? `shipmentColumns:${userId}` : null;
  const [visible, setVisible] = useState<string[]>(DEFAULT_SHIPMENT_COLUMNS);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      setVisible(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SHIPMENT_COLUMNS);
    } catch {
      setVisible(DEFAULT_SHIPMENT_COLUMNS);
    }
  }, [storageKey]);

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

  const reset = useCallback(() => save(DEFAULT_SHIPMENT_COLUMNS), [save]);

  return { visible, save, reset };
}
