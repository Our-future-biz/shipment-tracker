import type { ReactNode } from "react";
import { ModuleGate } from "@/components/ModuleGate";
import { WarehouseScanListener } from "./_components/WarehouseScanListener";
import { FloorQueueProvider } from "./floor/_lib/useFloorQueue";
import { FloorQueueNotice } from "./floor/_components/FloorQueueNotice";

// Every Warehouse page listens for handheld scanner input (see WarehouseScanListener) and keeps
// sending what floor mode queued while offline (FloorQueueProvider), with a notice outside floor mode.
// A company with the Warehouse Concept hidden is sent to the dashboard (ModuleGate).
export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return (
    <ModuleGate module="warehouse_concept">
      <FloorQueueProvider>
        {children}
        <WarehouseScanListener />
        <FloorQueueNotice />
      </FloorQueueProvider>
    </ModuleGate>
  );
}
