import type { ReactNode } from "react";
import { WarehouseScanListener } from "./_components/WarehouseScanListener";
import { FloorQueueProvider } from "./floor/_lib/useFloorQueue";
import { FloorQueueNotice } from "./floor/_components/FloorQueueNotice";

// Every Warehouse page listens for handheld scanner input (see WarehouseScanListener) and keeps
// sending what floor mode queued while offline (FloorQueueProvider), with a notice outside floor mode.
export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return (
    <FloorQueueProvider>
      {children}
      <WarehouseScanListener />
      <FloorQueueNotice />
    </FloorQueueProvider>
  );
}
