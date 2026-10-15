"use client";

import { useParams } from "next/navigation";
import { PortalFrame } from "../../../_components/PortalFrame";
import { PortalOrderView } from "../../../_components/PortalOrderView";

// One order in the haulier portal (AppShell OPEN_PATHS).
export default function HaulierPortalOrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PortalFrame>
      <PortalOrderView id={id} />
    </PortalFrame>
  );
}
