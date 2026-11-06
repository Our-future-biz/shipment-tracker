"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SuperadminOnly } from "@/components/SuperadminOnly";
import { useAuth } from "@/lib/auth/AuthContext";
import { isWarehouseManagerOnly, WAREHOUSE_MANAGERS_PATH } from "@/lib/concepts";
import { WarehouseScanListener } from "./WarehouseScanListener";
import { FloorQueueProvider } from "../floor/_lib/useFloorQueue";
import { FloorQueueNotice } from "../floor/_components/FloorQueueNotice";

// Warehouse Concept is shown to superadmins only, with its handheld scanner listener and the queue
// of what floor mode couldn't send. The one exception is the warehouse managers' page, which admins
// and managers open too, on its own, without the floor's machinery.
export function WarehouseConceptGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  if (isWarehouseManagerOnly(user) && pathname.startsWith(WAREHOUSE_MANAGERS_PATH)) return <>{children}</>;
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
