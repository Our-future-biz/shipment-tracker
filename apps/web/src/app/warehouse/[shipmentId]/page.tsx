"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { WAREHOUSE_SECTIONS, type WarehouseSection } from "../_components/warehouseRules";

// The old address of a shipment opened from a warehouse list (/warehouse/<id>?from=stock): it
// leads on to the new one under that list (/warehouse/stock/<id>), so saved links keep working.
export default function OldWarehouseShipmentPage() {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const from = useSearchParams().get("from") ?? "";
  const section: WarehouseSection = from in WAREHOUSE_SECTIONS ? (from as WarehouseSection) : "in";
  const router = useRouter();
  useEffect(() => {
    router.replace(`/warehouse/${section}/${shipmentId}`);
  }, [router, section, shipmentId]);
  return (
    <div className="flex justify-center p-20">
      <Spin size="large" />
    </div>
  );
}
