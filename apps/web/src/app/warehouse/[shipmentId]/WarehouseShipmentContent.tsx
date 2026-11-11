"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Spin } from "antd";
import { BackLink } from "@/components/BackLink";
import { useShipment } from "@/hooks/useShipment";
import { WarehouseTab } from "@/app/shipments/[jobNumber]/tabs/WarehouseTab";
import { LINK, PAGE_TITLE, REF } from "@/styles/ui";
import { WAREHOUSE_SECTIONS, type WarehouseSection } from "../_components/warehouseRules";

// What a reference on In Warehouse / Stock / Out Warehouse opens: the shipment's Warehouse
// tab on its own, without the rest of the shipment detail. It is the same component over
// the same shipment, so what is filled in here shows on the shipment and the other way round.
// Its address is under the list it was opened from (/warehouse/stock/<id>), so the sidebar keeps that list lit.
// The shipment is read on its own: a list holds only its newest rows, and Out Warehouse grows for good.
export function WarehouseShipmentContent({ section }: { section: WarehouseSection }) {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const { shipment, isLoading, notFound, error, reload } = useShipment(shipmentId);
  const back = <BackLink href={`/warehouse/${section}`}>{WAREHOUSE_SECTIONS[section]}</BackLink>;

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-10 text-center text-slate-500">
        {/* "Not found" is said only when the server said so; a request that failed is tried again. */}
        {notFound ? (
          "Shipment not found."
        ) : (
          <>
            Could not load the shipment - {error}.{" "}
            <Button size="small" onClick={() => reload()}>
              Retry
            </Button>
          </>
        )}{" "}
        {back}
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div>
          {back}
          <div className="flex items-center justify-between gap-4 mt-1.5">
            <div className="flex items-baseline gap-3">
              <h1 className={`${PAGE_TITLE} ${REF}`}>{shipment.jobNumber ?? shipment.id}</h1>
              {shipment.warehouseReference && (
                <span className={`${REF} text-[13px] font-semibold text-slate-500`}>{shipment.warehouseReference}</span>
              )}
            </div>
            <Link href={`/shipments/${shipment.id}`} className={`text-[13px] ${LINK}`}>
              Open shipment
            </Link>
          </div>
        </div>
        <WarehouseTab shipment={shipment} />
      </div>
    </div>
  );
}
