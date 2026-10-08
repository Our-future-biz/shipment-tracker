"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { WarehouseShipmentsView } from "../_components/WarehouseShipmentsView";
import { ReleaseToTruckModal } from "../_components/ReleaseToTruckModal";
import { NOTHING_TICKED, useWarehouseMove } from "../_components/useWarehouseMove";

export default function StockPage() {
  const toast = useToast();
  const move = useWarehouseMove({ warehouseReleasedDate: "today" }, "Out Warehouse");
  // A new truck gets its TCZ reference only now, so a cancelled dialog uses no number up.
  const release = async (ids: string[], truck: string | null) => {
    try {
      return await move(ids, truck ?? (await api.warehouse.warehouseTruckCreate()).reference);
    } catch {
      toast.error("Could not create the truck reference");
      return false;
    }
  };
  // One taken in by mistake goes back to In Warehouse.
  const backToIn = useWarehouseMove({ warehouseReceivedDate: "clear" }, "In Warehouse");
  // Shipments waiting for the truck to be chosen (Vyskladnit pressed).
  const [toRelease, setToRelease] = useState<string[] | null>(null);

  return (
    <>
      <WarehouseShipmentsView
        section="stock"
        selectionActions={[
          { label: "Vyskladnit", onClick: (ids) => (ids.length ? setToRelease(ids) : toast.error(NOTHING_TICKED)) },
          { label: "Vrátit do In Warehouse", secondary: true, onClick: backToIn },
        ]}
      />
      <ReleaseToTruckModal shipmentIds={toRelease} onClose={() => setToRelease(null)} onRelease={release} />
    </>
  );
}
