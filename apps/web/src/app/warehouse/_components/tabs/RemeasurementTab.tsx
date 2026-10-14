"use client";

import Link from "next/link";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { WarehouseTab } from "@/app/shipments/[jobNumber]/tabs/WarehouseTab";

// Remeasurement / Release: the warehouse part of one imported shipment (details, notes,
// remeasurement, push to suppliers; pick-up view-only), opened from its Internal Reference
// in Positions or from "Edit in Warehouse" in Shipments.
export function RemeasurementTab({ shipmentId, onBack }: { shipmentId: string | null; onBack: () => void }) {
  if (!shipmentId) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <div className="text-sm font-semibold text-slate-700">No shipment open</div>
        <div className="text-xs text-slate-400 mt-1">Click an Internal Reference in Positions to open its remeasurement here.</div>
      </div>
    );
  }
  return <ShipmentPart shipmentId={shipmentId} onBack={onBack} />;
}

function ShipmentPart({ shipmentId, onBack }: { shipmentId: string; onBack: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["warehouse-shipment", shipmentId],
    queryFn: () => api.shipments.shipmentGet(shipmentId),
  });
  const { data: tasks } = useQuery({
    queryKey: ["warehouse", "by-shipment", shipmentId],
    queryFn: () => api.warehouse.warehouseList({ shipmentId }),
  });
  const position = tasks?.tasks[0];

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  const back = (
    <button onClick={onBack} aria-label="Back to Positions" className="text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1">
      <ArrowLeftOutlined />
    </button>
  );

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        {back} Shipment not found.
      </div>
    );
  }

  const shipment = data.shipment;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {back}
        <h2 className="text-[20px] font-bold text-slate-800 m-0 font-mono">{shipment.jobNumber}</h2>
        {position && (
          <Link href={`/warehouse/${position.id}`} className="ml-2 font-mono text-sm font-bold text-indigo-500">
            {position.taskId}
          </Link>
        )}
        {shipment.customer && <span className="ml-2 text-sm text-slate-500">{shipment.customer}</span>}
      </div>
      <WarehouseTab shipment={shipment} />
    </div>
  );
}
