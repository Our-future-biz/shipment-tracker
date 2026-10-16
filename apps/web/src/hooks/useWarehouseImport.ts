"use client";

import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { warehouseImportKeys } from "./warehouseKeys";

// Where shipments are imported into the warehouse from: the shipment list (searched, paged) and
// master jobs (each opened for its shipments).

/** Shipments matching `search`, `pageSize` at a time (infinite scroll). */
export const useImportShipmentSearch = (search: string, pageSize: number) =>
  useInfiniteQuery({
    queryKey: warehouseImportKeys.shipments(search),
    queryFn: ({ pageParam }) => api.shipments.shipmentList({ limit: pageSize, offset: pageParam, search: search || undefined }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.pagination.offset + last.pagination.limit;
      return next < last.pagination.total ? next : undefined;
    },
  });

export const useImportMasterJobs = () =>
  useQuery({
    queryKey: warehouseImportKeys.masters(),
    queryFn: () => api.shipments.masterJobList(),
  });

/** The picked master jobs, each with its shipments. */
export const useImportMasterJobDetails = (ids: string[]) =>
  useQueries({
    queries: ids.map((id) => ({
      queryKey: warehouseImportKeys.master(id),
      queryFn: () => api.shipments.masterJobGet(id),
    })),
  });
