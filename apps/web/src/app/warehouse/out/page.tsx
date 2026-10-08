"use client";

import { WarehouseShipmentsView } from "../_components/WarehouseShipmentsView";
import { useWarehouseMove } from "../_components/useWarehouseMove";

export default function OutWarehousePage() {
  // One sent here by mistake can be returned: to In Warehouse, which starts it over, or one
  // step back to Stock, which keeps the date it was received.
  const backToIn = useWarehouseMove({ warehouseReceivedDate: "clear", warehouseReleasedDate: "clear" }, "In Warehouse", { clearTruck: true });
  const backToStock = useWarehouseMove({ warehouseReleasedDate: "clear" }, "Stock", { clearTruck: true });
  return (
    <WarehouseShipmentsView
      section="out"
      selectionActions={[
        { label: "Vrátit do In Warehouse", secondary: true, onClick: backToIn },
        { label: "Vrátit do Stock", secondary: true, onClick: backToStock },
      ]}
    />
  );
}
