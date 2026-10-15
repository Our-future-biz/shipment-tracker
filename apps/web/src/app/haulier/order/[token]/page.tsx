"use client";

import { useParams } from "next/navigation";
import { HaulierOrderView } from "../../_components/HaulierOrderView";

// The haulier's link from the transport order: outside the sign-in (AppShell OPEN_PATHS).
export default function HaulierOrderPage() {
  const { token } = useParams<{ token: string }>();
  return <HaulierOrderView token={token} />;
}
