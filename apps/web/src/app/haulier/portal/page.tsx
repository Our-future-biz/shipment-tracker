"use client";

import { PortalFrame } from "../_components/PortalFrame";
import { PortalOrderList } from "../_components/PortalOrderList";

// The haulier portal's start: the signed-in haulier's orders. Outside the app sign-in (AppShell OPEN_PATHS).
export default function HaulierPortalPage() {
  return (
    <PortalFrame>
      <PortalOrderList />
    </PortalFrame>
  );
}
