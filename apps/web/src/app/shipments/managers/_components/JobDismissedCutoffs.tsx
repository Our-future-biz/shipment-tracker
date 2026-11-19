"use client";

import { useState } from "react";
import { useCutoffDismissals } from "@/hooks/useShipmentManagerActions";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { dismissalTitle } from "@/lib/managerActions";
import { HINT, LINK } from "@/styles/ui";
import { cutoffsToast } from "../_lib/cockpitActions";
import { canOpenShipmentsManagers } from "../_lib/cockpitAddress";
import { DismissCutoffDialog } from "./DismissCutoffDialog";

// A dismissed cut-off taken back from the job's own page too (mock test council P13), not only from Shipments →
// Managers' audit list: a manager sees a line naming the job's dismissals that stand - "Dismissed cut-offs:
// Closing 16.11.2026 · Take back…" - and the same dialog as on the cockpit lists them, each to be taken back. For
// anybody else, and while the job has none, nothing is drawn (the dismissals are read for managers only).

export function JobDismissedCutoffs({ shipmentId, jobNumber, className = "" }: { shipmentId: string; jobNumber: string; className?: string }) {
  const { user } = useAuth();
  const manager = canOpenShipmentsManagers(user);
  const toast = useToast();
  const { dismissals } = useCutoffDismissals(shipmentId, manager);
  const [open, setOpen] = useState(false);
  if (!manager || dismissals.length === 0) return null;
  return (
    <div className={`${HINT} ${className}`}>
      Dismissed cut-off{dismissals.length === 1 ? "" : "s"}: {dismissals.map(dismissalTitle).join(" · ")} ·{" "}
      <button type="button" className={LINK} onClick={() => setOpen(true)}>
        Take back…
      </button>
      <DismissCutoffDialog
        open={open}
        job={{ id: shipmentId, jobNumber }}
        cutoffs={[]}
        onClose={() => setOpen(false)}
        onDone={(what) => {
          const said = cutoffsToast(jobNumber, what);
          if (said.tone === "success") toast.success(said.text);
          else toast.info(said.text);
        }}
      />
    </div>
  );
}
