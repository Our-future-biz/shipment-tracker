"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spin } from "antd";
import { remeasurementHref } from "@/app/warehouse/_components/remeasurementLinks";

// A shipment's warehouse part now lives in Warehouse → Remeasurement / Release; older links
// land here and are sent on.
export function WarehouseShipmentContent() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const router = useRouter();
  useEffect(() => router.replace(remeasurementHref(shipmentId)), [router, shipmentId]);
  return (
    <div className="flex justify-center p-20">
      <Spin size="large" />
    </div>
  );
}
