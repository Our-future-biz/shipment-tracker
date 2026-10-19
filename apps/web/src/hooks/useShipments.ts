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
  /** Free-text search, executed server-side across job#, shipper, consignee, customer, POL, POD. */
  search?: string;
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
    mutationFn: ({ id, data }: { id: string; data: controllers.ShipmentUpdateRequest }) =>
      api.shipments.shipmentUpdate(id, data),
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
      ctx?.prev?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: (_data, _err, { data }) => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
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
  const updateField = useCallback(
    (shipmentId: string, fieldKey: string, value: string, loaded?: ShipmentItem) => {
      const col = COLUMN_MAP.get(fieldKey);
      if (!col) return;

      // Get old value for automation comparison - before the optimistic edit below changes it.
      const shipment = loaded ?? cachedShipment(queryClient, shipmentId);
      const oldValue = shipment ? getFieldValue(shipment, fieldKey) : "";

      if (col.apiField) {
        updateMutation.mutate(
          { id: shipmentId, data: { [col.apiField]: value } as controllers.ShipmentUpdateRequest },
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

  // Search and status are applied server-side (scoped to the company), so they cover the
  // whole dataset rather than only the rows already loaded in the browser.
  const query = useQuery({
    queryKey: ["shipments", search ?? "", statusBucket ?? "", tile ?? "", warehouse ?? "", customs ?? "", masterJobMcz ?? ""],
    queryFn: () => api.shipments.shipmentList({ limit: SHIPMENT_LIST_LIMIT, search, statusBucket, tile, warehouse, customs, masterJobMcz }),
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
