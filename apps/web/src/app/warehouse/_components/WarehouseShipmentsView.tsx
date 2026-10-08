"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useShipments } from "@/hooks/useShipments";
import { ShipmentsTable, type ShipmentsTableProps } from "@/app/shipments/_components/ShipmentsTable";
import { useDebounced } from "@/app/shipments/_components/ShipmentsView";
import { WAREHOUSE_DEFAULT_COLUMNS, WAREHOUSE_LEAD_COLUMN, WAREHOUSE_RULES, WAREHOUSE_SECTIONS, type WarehouseSection } from "./warehouseRules";

// A Warehouse page (In / Out Warehouse, Stock) as a view of the shipments: the Shipments
// table itself over the same live rows. Nothing is copied, so an edit made here is an edit
// of the shipment. Shipments are not created or grouped into master jobs from here.
// The page lists the shipments its section's rule picks (warehouseRules).
// A reference opens the shipment's warehouse view (/warehouse/<id>), not the shipment itself.
export function WarehouseShipmentsView({
  section,
  selectionActions,
}: {
  section: WarehouseSection;
  /** The page's own buttons above the table, acting on the ticked shipments. */
  selectionActions?: ShipmentsTableProps["selectionActions"];
}) {
  const searchParams = useSearchParams();
  const search = useDebounced(searchParams.get("q") ?? "", 300);
  const statusBucket = searchParams.get("status") ?? "all";
  const { shipments: all, isLoading } = useShipments({ search, statusBucket });
  const shipments = useMemo(() => all.filter(WAREHOUSE_RULES[section]), [all, section]);

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
        <ShipmentsTable shipments={shipments} isLoading={isLoading} view={{ key: `warehouse-${section}`, title: WAREHOUSE_SECTIONS[section], detailHref: `/warehouse/:id?from=${section}`, defaultColumns: WAREHOUSE_DEFAULT_COLUMNS, leadColumn: WAREHOUSE_LEAD_COLUMN[section] }} selectionActions={selectionActions} />
      </div>
    </div>
  );
}
