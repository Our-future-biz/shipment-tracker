"use client";

import { useMemo } from "react";
import { useShipments } from "@/hooks/useShipments";
import { STATUS_COLORS, isActiveStatus } from "@/lib/enums";
import { KpiCard } from "./KpiCard";
import { ActiveShipmentsTable } from "./ActiveShipmentsTable";

export const DashboardView = () => {
  const { shipments, isLoading } = useShipments();

  const kpis = useMemo(() => ({
    totalActive: shipments.filter((s) => isActiveStatus(s.status)).length,
    total: shipments.length,
    imports: shipments.filter((s) => s.tradeDirection === "Import").length,
    exports: shipments.filter((s) => s.tradeDirection === "Export").length,
  }), [shipments]);

  const activeShipments = useMemo(() => shipments.filter((s) => isActiveStatus(s.status)), [shipments]);

  if (isLoading) {
    return <div className="p-6 flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Active Shipments Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total Active" value={kpis.totalActive} color="#14b8a6" />
          <KpiCard label="Total" value={kpis.total} color="#64748b" />
          <KpiCard label="Imports" value={kpis.imports} color="#3b82f6" />
          <KpiCard label="Exports" value={kpis.exports} color="#f59e0b" />
        </div>
      </section>
      <ActiveShipmentsTable shipments={activeShipments} />
    </div>
  );
};
