import type { ReactNode } from "react";
import { WarehouseConceptGate } from "./_components/WarehouseConceptGate";

// Every Warehouse page listens for handheld scanner input (see WarehouseScanListener) and keeps
// sending what floor mode queued while offline (FloorQueueProvider), with a notice outside floor mode.
// Who sees what is the gate's: superadmins everything, admins and managers only the managers' page.
export default function WarehouseConceptLayout({ children }: { children: ReactNode }) {
  return <WarehouseConceptGate>{children}</WarehouseConceptGate>;
}
