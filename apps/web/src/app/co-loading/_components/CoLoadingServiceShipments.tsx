"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDebounced } from "@/hooks/useDebounced";
import { useShipments } from "@/hooks/useShipments";
import { ShipmentsTable } from "@/app/shipments/_components/ShipmentsTable";
import { COLUMNS } from "@/lib/columnConfig";
import { isServiceShipment } from "../_lib/services";

// Every column, read-only: a closed service takes nothing new until it is reopened.
const ALL_COLUMNS_READONLY = COLUMNS.map((c) => c.key);

/**
 * A Co-Loading Concept service's shipments: the Shipments grid itself, over the live rows of the
 * jobs whose Service Name is the service's (ISHA). Nothing is copied, so an edit made here is an
 * edit of the shipment, as on Warehouse. The server lists them by Service Name; the same rule is
 * applied to the loaded rows too, so a job whose Service Name is changed here leaves at once.
 * Shipments are not created or grouped into master jobs from here. A closed service shows them
 * read-only. The page above has the service's own heading, so the grid has none.
 */
export function CoLoadingServiceShipments({ serviceName, closed }: { serviceName: string; closed: boolean }) {
  const searchParams = useSearchParams();
  const search = useDebounced(searchParams.get("q") ?? "", 300);
  const statusBucket = searchParams.get("status") ?? "all";
  // The search looks only in the columns the table shows.
  const [searchColumns, setSearchColumns] = useState<string[]>();
  const { shipments: all, total, isLoading, isError } = useShipments({ search, searchColumns, statusBucket, serviceName });
  const shipments = useMemo(() => all.filter((s) => isServiceShipment(s.serviceName, serviceName)), [all, serviceName]);

  return (
    <ShipmentsTable
      shipments={shipments}
      cap={{ shown: all.length, total }}
      isLoading={isLoading}
      isError={isError}
      onVisibleColumnsChange={setSearchColumns}
      // One set of columns for every service: what a user picks shows on each of them.
      // The Sailing column leads: which jobs are on a box, and which still wait for one, is seen at once (Council Outlay 14, A1).
      view={{ key: "co-loading", title: "", leadColumn: "sailing", readonlyColumns: closed ? ALL_COLUMNS_READONLY : undefined }}
    />
  );
}
