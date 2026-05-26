"use client";

import { Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "./KpiCard";
import { NeedsAttentionCard } from "./NeedsAttentionCard";
import { UpcomingCard } from "./UpcomingCard";
import { RecentShipmentsTable } from "./RecentShipmentsTable";
import { useShipments } from "@/hooks/useShipments";
import { isActiveStatus } from "@/lib/enums";

export function DashboardView() {
  const router = useRouter();
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
    return <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><span style={{ color: "#94a3b8" }}>Loading...</span></div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Dashboard"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/shipments")}>
            New Shipment
          </Button>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Active Shipments" value={kpis.active} />
        <KpiCard label="Total Shipments" value={kpis.total} />
        <KpiCard label="Imports" value={kpis.imports} valueColor="#3b82f6" />
        <KpiCard label="Exports" value={kpis.exports} valueColor="#f59e0b" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <NeedsAttentionCard shipments={shipments} />
        <UpcomingCard shipments={shipments} />
      </div>
      <RecentShipmentsTable shipments={shipments} />
    </div>
  );
}
