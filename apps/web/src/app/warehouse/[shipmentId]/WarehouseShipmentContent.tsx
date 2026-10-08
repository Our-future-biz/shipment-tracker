"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useShipments } from "@/hooks/useShipments";
import { WarehouseTab } from "@/app/shipments/[jobNumber]/tabs/WarehouseTab";
import { WAREHOUSE_SECTIONS, type WarehouseSection } from "../_components/warehouseRules";

// What a reference on In Warehouse / Stock / Out Warehouse opens: the shipment's Warehouse
// tab on its own, without the rest of the shipment detail. It is the same component over
// the same shipment, so what is filled in here shows on the shipment and the other way round.
export function WarehouseShipmentContent() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const from = useSearchParams().get("from") ?? "";
  const section: WarehouseSection = from in WAREHOUSE_SECTIONS ? (from as WarehouseSection) : "in";
  const { shipments, isLoading } = useShipments();
  const shipment = shipments.find((s) => s.id === shipmentId);
  const back = (
    <Link href={`/warehouse/${section}`} className="inline-flex items-center gap-1.5 text-[13px] text-indigo-500 hover:text-indigo-600">
      <ArrowLeftOutlined className="text-[11px]" />
      {WAREHOUSE_SECTIONS[section]}
    </Link>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!shipment) {
    return <div className="p-10 text-center text-slate-500">Shipment not found. {back}</div>;
  }

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div>
          {back}
          <div className="flex items-center justify-between gap-4 mt-1.5">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-slate-900 m-0">{shipment.jobNumber ?? shipment.id}</h1>
              {shipment.warehouseReference && (
                <span className="font-mono text-[13px] font-semibold text-slate-500">{shipment.warehouseReference}</span>
              )}
            </div>
            <Link href={`/shipments/${shipment.id}`} className="text-[13px] text-slate-500 hover:text-indigo-500">
              Open shipment
            </Link>
          </div>
        </div>
        <WarehouseTab shipment={shipment} />
      </div>
    </div>
  );
}
