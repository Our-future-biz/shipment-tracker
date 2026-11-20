"use client";

import { useCallback, useEffect, useState } from "react";

// Default visible columns (columnConfig keys) for a user with no saved set: the job and its customer,
// then what an operator's morning check asks of each job - its Shipment Status, its ports, its
// Closing, ETD and ETA (user council O15) - right after Customer. Shipment Status comes first of
// them: at 1440 px beside the 260 px menu it is then on the first screen (review of mock council
// S9-1); then who handles it and the rest of the original table. Shipments Month, Year and
// Department are no longer shown at first: the Columns panel adds them (mock council S9-1). A saved
// set or template is kept as it is; NewDefaultColumnsNotice tells its user about these defaults.
export const DEFAULT_SHIPMENT_COLUMNS = [
  "jobNumber",
  "customer",
  "status",
  "pol",
  "pod",
  "closingDate",
  "estimatedDeparture",
  "estimatedArrival",
  "personInCharge",
  "holidayCover",
  "customerPic",
  "masterJob",
];

/** Names the defaults above for the notice to a user with a set of their own (mock council S9-2). */
export const SHIPMENT_DEFAULTS_VERSION = "2026-11-s9-1";

/**
 * A column view other than the Shipments grid's own (e.g. the Warehouse overview): it keeps
 * its columns and active template under `scope` and starts from `defaults`, which must be
 * a stable array.
 */
export interface ColumnViewScope {
  scope: string;
  defaults: string[];
}

/**
 * "Created by" used to hold the time as well; since it was split, a saved list that shows it
 * gets "Created on" right after it — once (a flag is then set), so it can be removed again.
 */
export function withCreatedOn(keys: string[]): string[] {
  const at = keys.indexOf("createdBy");
  if (at < 0 || keys.includes("createdOn")) return keys;
  return [...keys.slice(0, at + 1), "createdOn", ...keys.slice(at + 1)];
}

export function useColumnPrefs(userId: string | undefined, view?: ColumnViewScope) {
  const storageKey = userId ? (view ? `${view.scope}:columns:${userId}` : `shipmentColumns:${userId}`) : null;
  const defaults = view?.defaults ?? DEFAULT_SHIPMENT_COLUMNS;
  const [visible, setVisible] = useState<string[]>(defaults);
  // Whether `visible` is a set the user saved (else it is the defaults): such a set keeps new
  // defaults from reaching them, so they are told (mock council S9-2).
  const [isOwn, setIsOwn] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const own = Array.isArray(parsed) && parsed.length > 0;
      let keys: string[] = own ? parsed : defaults;
      const addedKey = `${storageKey}:createdOnAdded`;
      if (!localStorage.getItem(addedKey)) {
        const next = withCreatedOn(keys);
        if (next !== keys) localStorage.setItem(storageKey, JSON.stringify(next));
        localStorage.setItem(addedKey, "1");
        keys = next;
      }
      setVisible(keys);
      setIsOwn(own);
    } catch {
      setVisible(defaults);
      setIsOwn(false);
    }
  }, [storageKey, defaults]);

  const save = useCallback(
    (keys: string[]) => {
      setVisible(keys);
      setIsOwn(true);
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

  return { visible, save, reset, own: isOwn ? visible : null };
}
