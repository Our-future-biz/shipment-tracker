"use client";

import { useMasterJob } from "@/hooks/useMasterJobs";
import { useAuth } from "@/lib/auth/AuthContext";
import { cameFromLabel, openMasterJobOf, shipmentCameFrom } from "@/lib/cameFrom";

// A shipment's page offers the way back to where it was opened from (a master job's Linked
// Shipments, the Cockpit, a customer...) beside Shipments. Noted by the app shell's CameFromTracker
// (lib/cameFrom), with the address as it was left, so a master job reopens on the tab it was on.

// Where this shipment's page leads back to, or null when there is nowhere but the Shipments list.
// A master job is named by its number (MCZFULL00000006).
export function useShipmentCameFrom(shipmentId: string): { href: string; label: string } | null {
  const { user } = useAuth();
  const href = shipmentCameFrom.useHref(shipmentId);
  const masterJobId = href ? openMasterJobOf(href) : null;
  const { masterJob } = useMasterJob(masterJobId);

  if (!href) return null;
  return { href, label: masterJob?.mczNumber || cameFromLabel(href, user) };
}
