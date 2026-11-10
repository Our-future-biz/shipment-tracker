"use client";

import { useShipment } from "@/hooks/useShipment";
import { useAuth } from "@/lib/auth/AuthContext";
import { cameFromLabel, customerCameFrom, recordIdOf } from "@/lib/cameFrom";

// A customer's page offers the way back to where it was opened from (shipments, quotes, invoicing,
// customs...) beside Customer Database. Noted by the app shell's CameFromTracker (lib/cameFrom).

// Where this customer's page leads back to, or null when there is nowhere but the list. A shipment
// is named by its job number, read by the id in its address.
export function useCustomerCameFrom(customerId: string): { href: string; label: string } | null {
  const { user } = useAuth();
  const href = customerCameFrom.useHref(customerId);
  const shipmentId = href ? recordIdOf("shipments", href) : null;
  const { shipment } = useShipment(shipmentId ?? undefined);

  if (!href) return null;
  return { href, label: shipmentId ? shipment?.jobNumber || "Shipment" : cameFromLabel(href, user) };
}
