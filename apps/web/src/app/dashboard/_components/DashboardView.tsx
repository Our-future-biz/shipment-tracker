"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "./KpiCard";
import { NeedsAttentionCard } from "./NeedsAttentionCard";
import { UpcomingCard } from "./UpcomingCard";
import { RecentShipmentsTable } from "./RecentShipmentsTable";
import { useShipments } from "@/hooks/useShipments";
import { isActiveStatus } from "@/lib/enums";

export function DashboardView() {
  const { shipments, isLoading } = useShipments();

  const kpis = useMemo(() => {
    const active = shipments.filter((s) => isActiveStatus(s.status));
    return {
      active: active.length,
      total: shipments.length,
      imports: shipments.filter((s) => s.tradeDirection === "Import").length,
      exports: shipments.filter((s) => s.tradeDirection === "Export").length,
    };
  }, [shipments]);

  if (isLoading) {
    return <div className="flex justify-center p-20"><span className="text-slate-400">Loading...</span></div>;
  }

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KpiCard label="Active Shipments" value={kpis.active} />
        <KpiCard label="Total Shipments" value={kpis.total} />
        <KpiCard label="Imports" value={kpis.imports} valueColor="#3b82f6" />
        <KpiCard label="Exports" value={kpis.exports} valueColor="#f59e0b" />
      </div>
      <div className="grid grid-cols-2 gap-3.5 mb-5">
        <NeedsAttentionCard shipments={shipments} />
        <UpcomingCard shipments={shipments} />
      </div>
      <RecentShipmentsTable shipments={shipments} />
      </div>
    </div>
  );
}
