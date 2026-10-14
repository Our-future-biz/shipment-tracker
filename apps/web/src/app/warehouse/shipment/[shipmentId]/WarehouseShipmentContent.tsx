"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { WarehouseTab } from "@/app/shipments/[jobNumber]/tabs/WarehouseTab";

// The warehouse part of an imported shipment, opened from its Internal Reference in the
// Positions grid. The warehouse edits it here; Shipments shows the same values read-only.
export function WarehouseShipmentContent() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const router = useRouter();

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

  if (isError || !data) {
    return (
      <div className="p-10 text-center text-slate-500">
        Shipment not found.{" "}
        <Link href="/warehouse" className="text-indigo-500">
          Back to Warehouse
        </Link>
      </div>
    );
  }

  const shipment = data.shipment;
  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/warehouse")}
            aria-label="Back to Warehouse"
            className="text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1"
          >
            <ArrowLeftOutlined />
          </button>
          <h1 className="text-[22px] font-bold text-slate-800 m-0 font-mono">{shipment.jobNumber}</h1>
          {position && (
            <Link href={`/warehouse/${position.id}`} className="ml-2 font-mono text-sm font-bold text-indigo-500">
              {position.taskId}
            </Link>
          )}
          {shipment.customer && <span className="ml-2 text-sm text-slate-500">{shipment.customer}</span>}
        </div>
      </div>
      <div className="p-6">
        <WarehouseTab shipment={shipment} />
      </div>
    </div>
  );
}
