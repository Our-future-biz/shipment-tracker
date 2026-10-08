"use client";

import { WarehouseShipmentsView } from "../_components/WarehouseShipmentsView";
import { useWarehouseMove } from "../_components/useWarehouseMove";

export default function InWarehousePage() {
  const receive = useWarehouseMove({ warehouseReceivedDate: "today" }, "Stock", { assignReference: true });
  return <WarehouseShipmentsView section="in" selectionActions={[{ label: "Naskladnit", onClick: receive }]} />;
}
