"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { AppModal } from "@/components/AppModal";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useInvoicing } from "@/hooks/useInvoicing";
import { HINT } from "@/styles/ui";
import { BILLING_HINT, billingGaps } from "./billingRelease";

interface BillingReleaseDialogProps {
  shipment: interfaces.ShipmentItem;
  onClose: () => void;
  /** Sets the status: the caller saves it as any other edit. */
  onConfirm: () => void;
}

/**
 * Before a job's Shipment Status is set to Billing, in the grid or on its page (User Council O11, owner's answer
 * Q9 b): what it still lacks, as a warning - the user can set Billing all the same. A job that lacks nothing is
 * set at once, with no question. Closing the dialog leaves the status as it was.
 */
export function BillingReleaseDialog({ shipment, onClose, onConfirm }: BillingReleaseDialogProps) {
  const costs = useInvoicing(shipment.id);
  // The task list's own cache entry (hooks/useShipmentTasks), read here with its error: a list not read is not "nothing ticked".
  // One retry only: a read that fails says "not checked" in a second or two, not "Checking…" for the default retries' ~7 s.
  const tasks = useQuery({ queryKey: ["shipment-tasks", shipment.id], queryFn: () => api.shipments.taskList(shipment.id), retry: 1 });
  const loading = costs.isLoading || tasks.isLoading;
  const gaps = useMemo(
    () =>
      billingGaps({
        shipment,
        selling: costs.data && !costs.isError ? costs.data.sellingCosts : null,
        buying: costs.data && !costs.isError ? costs.data.costs : null,
        ticked: tasks.data && !tasks.isError ? new Set(tasks.data.tasks.filter((t) => t.completed).map((t) => t.taskKey)) : null,
      }),
    [shipment, costs.data, costs.isError, tasks.data, tasks.isError],
  );
  const unread = [costs.isError && "the Costs tab", tasks.isError && "the tasks"].filter((x): x is string => !!x);

  // Nothing missing and everything read: no warning to give, the status is set.
  const confirmed = useRef(false);
  const confirm = () => {
    if (confirmed.current) return;
    confirmed.current = true;
    onConfirm();
  };
  const nothingMissing = !loading && gaps.length === 0 && unread.length === 0;
  useEffect(() => {
    if (nothingMissing) confirm();
  });

  if (nothingMissing) return null;
  return (
    <AppModal
      open
      onClose={onClose}
      title={`Set ${shipment.jobNumber} to Billing?`}
      subtitle={`${BILLING_HINT}.`}
      size="medium"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Keep the status</Button>
          <Button type="primary" onClick={confirm}>
            Set Billing
          </Button>
        </div>
      }
    >
      {loading ? (
        <p className={`${HINT} py-1`}>Checking what the job still lacks…</p>
      ) : (
        <div className="flex flex-col gap-2 py-1 text-[13px] text-slate-700">
          {gaps.length > 0 && (
            <>
              <span className="flex items-center gap-1.5 font-medium text-amber-700">
                <WarningOutlined aria-hidden /> The job still lacks:
              </span>
              <ul className="list-disc pl-5 space-y-0.5">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </>
          )}
          {unread.length > 0 && <span className={HINT}>{`Could not read ${unread.join(" or ")}: not checked.`}</span>}
          <span className={HINT}>You can set Billing all the same.</span>
        </div>
      )}
    </AppModal>
  );
}
