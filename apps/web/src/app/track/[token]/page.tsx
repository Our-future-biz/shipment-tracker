"use client";

import { useParams } from "next/navigation";
import { ShipmentStatusView } from "./ShipmentStatusView";

// The customer's link to one shipment: outside the sign-in (AppShell OPEN_PATHS).
export default function ShipmentStatusPage() {
  const { token } = useParams<{ token: string }>();
  return <ShipmentStatusView token={token} />;
}
