import type { ReactNode } from "react";
import { SuperadminOnly } from "@/components/SuperadminOnly";
import { WarehouseScanListener } from "./_components/WarehouseScanListener";
import { FloorQueueProvider } from "./floor/_lib/useFloorQueue";
import { FloorQueueNotice } from "./floor/_components/FloorQueueNotice";

// Every Warehouse page listens for handheld scanner input (see WarehouseScanListener) and keeps
// sending what floor mode queued while offline (FloorQueueProvider), with a notice outside floor mode.
// Warehouse Concept is shown to superadmins only (SuperadminOnly).
export default function WarehouseConceptLayout({ children }: { children: ReactNode }) {
  return (
    <SuperadminOnly>
      <FloorQueueProvider>
        {children}
        <WarehouseScanListener />
        <FloorQueueNotice />
      </FloorQueueProvider>
    </SuperadminOnly>
  );
}
