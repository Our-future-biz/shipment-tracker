"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getFieldValue, useShipments } from "@/hooks/useShipments";
import { formatDate } from "@/lib/date";
import { WarehouseSectionGrid, type WarehouseColumn, type WarehouseRow } from "../_components/WarehouseSectionGrid";

// In Warehouse lists what is coming in: shipments whose ETA Warehouse/HUB falls within the
// next 30 days, plus the ones whose date has already passed and are still not in.

const DAY = 86_400_000;
const WINDOW_DAYS = 30;

/** The grid stores dates as ISO or legacy MM/DD/YY; both parse to a day index. */
function dayIndex(raw: string): number | null {
  const txt = raw.trim();
  if (!txt) return null;
  const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Math.floor(Date.UTC(+iso[1]!, +iso[2]! - 1, +iso[3]!) / DAY);
  const legacy = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (legacy) {
    const [, mm, dd, yy] = legacy;
    const year = yy!.length === 2 ? 2000 + +yy! : +yy!;
    return Math.floor(Date.UTC(year, +mm! - 1, +dd!) / DAY);
  }
  const parsed = Date.parse(txt);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / DAY);
}

const COLUMNS: WarehouseColumn[] = [
  { key: "reference", title: "Warehouse Ref", width: 170 },
  { key: "jobNumber", title: "Internal Reference", width: 170 },
  // Overdue arrivals are shown in red so they cannot be missed.
  { key: "etaWarehouse", title: "ETA Warehouse", width: 150, warn: (r) => r.overdue === "1" },
  { key: "customer", title: "Customer", width: 200 },
  { key: "department", title: "Department", width: 190 },
  { key: "personInCharge", title: "Person In Charge", width: 180 },
  { key: "holidayCover", title: "Holiday Cover", width: 160 },
  { key: "status", title: "Shipment Status", width: 240 },
];

export default function InWarehousePage() {
  const { shipments, isLoading } = useShipments();

  // Shipments due at the warehouse, nearest first; an overdue one stays on the list.
  const due = useMemo(() => {
    const today = Math.floor(Date.now() / DAY);
    return shipments
      .map((s) => ({ s, day: dayIndex(getFieldValue(s, "etaWarehouse")) }))
      .filter(({ day }) => day !== null && day <= today + WINDOW_DAYS)
      .sort((a, b) => a.day! - b.day!);
  }, [shipments]);

  // Showing up in the warehouse is what gives a shipment its WHCZ reference; the server
  // hands back the one it already has when it was here before.
  const ids = due.map(({ s }) => s.id);
  const { data: refsData, isLoading: refsLoading } = useQuery({
    queryKey: ["warehouse-refs", ids.join(",")],
    queryFn: () => api.warehouse.warehouseEnsureRefs({ shipmentIds: ids }),
    enabled: ids.length > 0,
  });
  const warehouseRefOf = useMemo(() => new Map((refsData?.refs ?? []).map((r) => [r.shipmentId, r.reference])), [refsData]);

  const rows = useMemo<WarehouseRow[]>(() => {
    const today = Math.floor(Date.now() / DAY);
    return due
      .map(({ s, day }) => ({
        id: s.id,
        reference: warehouseRefOf.get(s.id) ?? "",
        jobNumber: s.jobNumber,
        etaWarehouse: formatDate(getFieldValue(s, "etaWarehouse")),
        customer: s.customer,
        department: s.department,
        personInCharge: s.personInCharge,
        holidayCover: s.holidayCover,
        status: s.status,
        overdue: day! < today ? "1" : "",
      }));
  }, [due, warehouseRefOf]);

  return (
    <WarehouseSectionGrid
      title="In Warehouse"
      subtitle={`Shipments with an ETA Warehouse within ${WINDOW_DAYS} days, overdue ones included`}
      storageKey="warehouse:in"
      columns={COLUMNS}
      rows={rows}
      loading={isLoading || refsLoading}
      statusOptions={[{ value: "all", label: "All Statuses" }]}
      emptyText="No shipment is due at the warehouse in the next 30 days."
    />
  );
}
