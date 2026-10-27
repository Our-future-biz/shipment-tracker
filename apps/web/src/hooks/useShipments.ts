"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { invalidateQuoteLists } from "./useSalesQuotes";
import { NEEDS_ATTENTION_KEY } from "./useShipmentsNeedingAttention";
import { api } from "@/lib/api";
import { COLUMNS, COLUMN_MAP, getComputedValue, COMPUTED_COLUMNS } from "@/lib/columnConfig";
import type { interfaces, controllers } from "@/lib/api/client";

export type ShipmentItem = interfaces.ShipmentItem;

// What is cached under ["shipments"]: pages of the list, and a shipment read on its own (useShipment).
type CachedShipments = { data?: ShipmentItem[]; shipment?: ShipmentItem };

// Get the display value for a column from a shipment record
export function getFieldValue(shipment: ShipmentItem, key: string): string {
  // Computed columns
  if (COMPUTED_COLUMNS.has(key)) {
    const rowData = buildRowData(shipment);
    return getComputedValue(key, rowData);
  }

  const col = COLUMN_MAP.get(key);
  if (!col) return "";

  // Direct API field
  if (col.apiField) {
    const val = shipment[col.apiField as keyof ShipmentItem];
    if (val == null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  }

  return "";
}

// Build a flat key→value map for a shipment (used for computed columns and conditional formatting)
export function buildRowData(shipment: ShipmentItem): Record<string, string> {
  const data: Record<string, string> = {};
  for (const col of COLUMNS) {
    // A computed column is never computed here (that would recurse), but one backed by a
    // stored field (Total Weight In Tons, Total Volume In CBM) still passes that stored
    // value on: it is what the column shows when there are no dimensions to compute from.
    if (col.apiField) {
      const val = shipment[col.apiField as keyof ShipmentItem];
      if (val == null) { data[col.key] = ""; }
      else if (typeof val === "object") { data[col.key] = JSON.stringify(val); }
      else { data[col.key] = String(val); }
    }
  }
  return data;
}

export interface ShipmentQueryParams {
  /** Free-text search, executed server-side (in `searchColumns`, else the usual references and parties). */
  search?: string;
  /** The grid columns the search looks in: the ones the user has chosen to show. */
  searchColumns?: string[];
  /** Coarse status bucket, matched server-side. */
  statusBucket?: string;
  /** Overview tile filter, matched server-side. */
  tile?: string;
  /** Warehouse page (in | stock | out), matched server-side. */
  warehouse?: string;
  /** Customs page filter (urgent), matched server-side. */
  customs?: string;
  /** The houses of the master job with this MCZ number, matched server-side. */
  masterJobMcz?: string;
  /** Refresh every this many ms — for lists that depend on the clock. */
  refetchInterval?: number;
  /** False to not load the list (yet), e.g. while the dialog that shows it is closed. */
  enabled?: boolean;
}

// Fields that trigger automation when changed
const AUTOMATION_FIELDS = new Set(["department", "status", "holidayCover"]);

/** Views computed from shipments (needs-attention list, tiles) — stale after any status change. */
/** Mutation key of every shipment write, so a reader can wait for writes of shipments only. */
export const SHIPMENT_WRITE_KEY = ["shipment-write"] as const;

// Writes to one shipment, chained so each starts after the previous one settled.
const writeQueues = new Map<string, Promise<unknown>>();
function queuedWrite<T>(id: string, write: () => Promise<T>): Promise<T> {
  const run = (writeQueues.get(id) ?? Promise.resolve()).catch(() => undefined).then(write);
  writeQueues.set(id, run);
  const clear = () => {
    if (writeQueues.get(id) === run) writeQueues.delete(id);
  };
  run.then(clear, clear);
  return run;
}

/** How many shipments one list holds: the newest this many (the list endpoint's maximum). */
export const SHIPMENT_LIST_LIMIT = 200;

export function invalidateShipmentDerivedViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: NEEDS_ATTENTION_KEY });
  queryClient.invalidateQueries({ queryKey: ["shipment-tile-counts"] });
}

/** Customer pages that show a customer's shipments and their rollups. */
export function invalidateShipmentCustomerViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["customer"] });
  queryClient.invalidateQueries({ queryKey: ["customer-shipments"] });
  // Only marked stale: the shipment page keeps the customers list mounted (CustomerLinkField)
  // and it must not be downloaded again on every cell edit.
  queryClient.invalidateQueries({ queryKey: ["customers"], refetchType: "none" });
}

/** How long after a customer or contact is saved the server has rewritten the shipments' copies of it. */
const COPIES_SETTLE_MS = 1500;

/**
 * Shipments keep copies of their customer's, parties' and contacts' names, which the server
 * rewrites when the Customer Database announces a change - a moment after the save, not with it.
 * So they are marked stale now (read again when next shown) and read again shortly after (what is
 * on screen then shows the new name without a reload).
 */
export function refreshShipmentCopies(queryClient: QueryClient, settleMs = COPIES_SETTLE_MS) {
  const keys = [["shipments"], ["customer-shipments"], NEEDS_ATTENTION_KEY];
  for (const queryKey of keys) queryClient.invalidateQueries({ queryKey, refetchType: "none" });
  setTimeout(() => {
    for (const queryKey of keys) queryClient.invalidateQueries({ queryKey });
  }, settleMs);
}

/** A shipment as some cached shipments query holds it: a list page or a shipment read on its own. */
function cachedShipment(queryClient: QueryClient, id: string): ShipmentItem | undefined {
  for (const [, cached] of queryClient.getQueriesData<CachedShipments>({ queryKey: ["shipments"] })) {
    const found = cached?.shipment?.id === id ? cached.shipment : cached?.data?.find((s) => s.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * The shipment writes, without loading any list: what a page that only edits shipments needs.
 * (useShipments adds them to its list.)
 */
export const useShipmentMutations = () => {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  // Shipment writes recompute the linked customer's rollups server-side and change the rows of
  // the customer page, so its caches must not keep serving the old copy.
  // Any shipment write can also move it onto or off the Needs Attention cards and tiles.
  const invalidateDerivedViews = () => invalidateShipmentDerivedViews(queryClient);
  const invalidateCustomerViews = () => invalidateShipmentCustomerViews(queryClient);

  // A sales quote remembers the shipment that carries its number, and may become Won by it: a
  // shipment created, deleted or given another Sales Number changes what Sales shows of its quote.
  const invalidateQuoteViews = () => {
    invalidateQuoteLists(queryClient);
  };

  const createMutation = useMutation({
    mutationFn: (params: controllers.ShipmentCreateRequest) => api.shipments.shipmentCreate(params),
    onSuccess: () => {
      invalidateCustomerViews();
      invalidateDerivedViews();
      invalidateQuoteViews();
      return queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });

  const updateMutation = useMutation({
    mutationKey: SHIPMENT_WRITE_KEY,
    // Writes to the same shipment go out one after another (a second save, e.g. a blur right
    // after a container number was completed, waits for the first), so the server never runs
    // two syncs of the same rows at once. Different shipments still save in parallel.
    mutationFn: ({ id, data }: { id: string; data: controllers.ShipmentUpdateRequest }) => queuedWrite(id, () => api.shipments.shipmentUpdate(id, data)),
    // Optimistic update for snappy inline editing. The query key carries the active
    // search/status, so patch every cached shipments page rather than one fixed key - and the
    // shipment read on its own, which is what the page of a shipment outside the list shows.
    // The rollback below restores every one of them.
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["shipments"] });
      const prev = queryClient.getQueriesData<CachedShipments>({ queryKey: ["shipments"] });
      const patched = (s: ShipmentItem): ShipmentItem => {
        if (s.id !== id) return s;
        // Merge update request into shipment using Object.assign for type safety
        const updated: ShipmentItem = { ...s };
        Object.assign(updated, data);
        // Mirrors the server: cargo lines of a removed container go with it, so a screen
        // opened before the refetch never shows or re-sends them - except when it was the
        // only container, whose cargo is the shipment's: it moves to the new only container,
        // or becomes shipment-level with none left.
        if (data.containers) {
          const ids = new Set(data.containers.flatMap((c) => (c.id ? [c.id] : [])));
          const before = (s.containers ?? []).flatMap((c) => (c.id ? [c.id] : []));
          const only = ids.size === 1 ? [...ids][0]! : null;
          const relink = <T extends { containerId?: string | null }>(ls: T[]): T[] => {
            if (before.length === 1 && !ids.has(before[0]!)) {
              return ls.map((l) => (l.containerId === before[0] || !l.containerId ? { ...l, containerId: only } : l));
            }
            return ls.filter((l) => !l.containerId || ids.has(l.containerId)).map((l) => (only && !l.containerId ? { ...l, containerId: only } : l));
          };
          updated.cargoItems = relink(s.cargoItems ?? []);
          updated.cargoDimensions = relink(s.cargoDimensions ?? []);
        }
        // Mirrors the server rule: a HUB with no CFS makes the HUB the CFS.
        if (updated.hub?.trim() && !updated.cfs?.trim()) updated.cfs = updated.hub.trim();
        return updated;
      };
      queryClient.setQueriesData<CachedShipments>({ queryKey: ["shipments"] }, (old) => {
        if (old?.shipment) return { ...old, shipment: patched(old.shipment) };
        if (old?.data) return { ...old, data: old.data.map(patched) };
        return old;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // The snapshot was taken before this write; with later writes still pending it would
      // also undo their edits, so then the refetch after the last write puts things right.
      if (queryClient.isMutating({ mutationKey: SHIPMENT_WRITE_KEY }) > 1) return;
      ctx?.prev?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: (_data, _err, { data }) => {
      // Refetch once the last pending write is done: a refetch between two queued writes
      // would show the first one's data over the second's optimistic edit.
      if (queryClient.isMutating({ mutationKey: SHIPMENT_WRITE_KEY }) <= 1) queryClient.invalidateQueries({ queryKey: ["shipments"] });
      // An edited date can put the shipment on, or take it off, the Needs Attention list.
      invalidateDerivedViews();
      invalidateCustomerViews();
      if (data.salesNumber !== undefined) invalidateQuoteViews();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.shipments.shipmentDelete(id),
    onSuccess: () => {
      invalidateCustomerViews();
      invalidateDerivedViews();
      invalidateQuoteViews();
      return queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });

  const linkMasterJobMutation = useMutation({
    mutationFn: ({ shipmentId, mczNumber }: { shipmentId: string; mczNumber: string }) =>
      api.shipments.shipmentLinkMasterJob(shipmentId, { mczNumber }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const unlinkMasterJobMutation = useMutation({
    mutationFn: (shipmentId: string) => api.shipments.shipmentUnlinkMasterJob(shipmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  // Update a single field (handles API field vs extra field routing). `loaded` is the shipment as
  // the caller shows it; without it the shipment is looked up in whatever shipments are cached
  // (the list on screen, a shipment page), so an edit of any shown row knows its old value.
  // `links` go with the value: the id of the record it names (a picked contact's id).
  const updateField = useCallback(
    (shipmentId: string, fieldKey: string, value: string, loaded?: ShipmentItem, links?: controllers.ShipmentUpdateRequest) => {
      const col = COLUMN_MAP.get(fieldKey);
      if (!col) return;

      // Get old value for automation comparison - before the optimistic edit below changes it.
      const shipment = loaded ?? cachedShipment(queryClient, shipmentId);
      const oldValue = shipment ? getFieldValue(shipment, fieldKey) : "";

      if (col.apiField) {
        updateMutation.mutate(
          { id: shipmentId, data: { [col.apiField]: value, ...links } as controllers.ShipmentUpdateRequest },
          // The edit is rolled back on failure; say why (e.g. a customs status the paperwork does not allow yet).
          { onError: (err) => message.error(err instanceof Error && err.message ? err.message : `Could not save ${col.title}`) },
        );
      }

      // Fire automation trigger for watched fields
      if (AUTOMATION_FIELDS.has(fieldKey) && value !== oldValue && shipment) {
        const shipmentData = buildRowData(shipment);
        // Actor (triggeredById) is derived server-side from the token.
        api.automation.automationTrigger({
          shipmentId,
          column: col.title,
          oldValue,
          newValue: value,
          shipmentData,
        }).catch(() => { /* fire and forget */ });
      }
    },
    [updateMutation, queryClient, message],
  );

  return {
    createShipment: createMutation.mutateAsync,
    updateShipment: updateMutation.mutateAsync,
    updateField,
    deleteShipment: deleteMutation.mutateAsync,
    linkMasterJob: linkMasterJobMutation.mutateAsync,
    unlinkMasterJob: unlinkMasterJobMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isLinkingMasterJob: linkMasterJobMutation.isPending,
  };
};

/** The newest 200 shipments the filters find (filtered server-side), with the shipment writes. */
export const useShipments = (params: ShipmentQueryParams = {}) => {
  const search = params.search?.trim() || undefined;
  const statusBucket = params.statusBucket && params.statusBucket !== "all" ? params.statusBucket : undefined;
  const tile = params.tile && params.tile !== "all" ? params.tile : undefined;
  const warehouse = params.warehouse || undefined;
  const customs = params.customs || undefined;
  const masterJobMcz = params.masterJobMcz?.trim() || undefined;
  // The columns only matter to a search: changing them without one doesn't reload the list.
  const searchColumns = search && params.searchColumns?.length ? params.searchColumns : undefined;

  // Search and status are applied server-side (scoped to the company), so they cover the
  // whole dataset rather than only the rows already loaded in the browser.
  const query = useQuery({
    queryKey: ["shipments", search ?? "", statusBucket ?? "", tile ?? "", warehouse ?? "", customs ?? "", masterJobMcz ?? "", searchColumns?.join(",") ?? ""],
    queryFn: () =>
      api.shipments.shipmentList({ limit: SHIPMENT_LIST_LIMIT, search, searchColumns, statusBucket, tile, warehouse, customs, masterJobMcz }),
    placeholderData: (prev) => prev,
    refetchInterval: params.refetchInterval,
    enabled: params.enabled ?? true,
  });

  const shipments: ShipmentItem[] = useMemo(() => query.data?.data ?? [], [query.data]);
  const mutations = useShipmentMutations();

  return {
    shipments,
    // How many shipments the search and filters find in all - the list above holds the newest of them.
    total: query.data?.pagination.total ?? 0,
    isLoading: query.isLoading,
    // The last request failed; rows read earlier may still be listed.
    isError: query.isError,
    ...mutations,
  };
};

export const useShipmentFilter = (shipments: ShipmentItem[]) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return shipments.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        // Search across all visible columns
        for (const col of COLUMNS) {
          const val = getFieldValue(s, col.key);
          if (val && val.toLowerCase().includes(q)) return true;
        }
        return false;
      }
      return true;
    });
  }, [shipments, search, statusFilter]);

  return { filtered, search, setSearch, statusFilter, setStatusFilter };
};
