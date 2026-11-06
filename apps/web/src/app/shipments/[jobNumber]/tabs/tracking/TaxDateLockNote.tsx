"use client";

import { LockOutlined } from "@ant-design/icons";
import { useShipmentTracking } from "@/hooks/useShipmentTracking";
import { HINT } from "@/styles/ui";

/**
 * Under ATA and ATD in Key Dates, and with `whenDeliveryDated` under the planned delivery of a job
 * dated by its delivery: says before a save what the server would refuse once the job is invoiced.
 */
export function TaxDateLockNote({ shipmentId, whenDeliveryDated = false }: { shipmentId: string; whenDeliveryDated?: boolean }) {
  const { data } = useShipmentTracking(shipmentId);
  if (!data?.taxDate.invoiced) return null;
  if (whenDeliveryDated && data.taxDate.basis !== "plannedDelivery") return null;
  return (
    <p className={`${HINT} m-0 pb-1 flex items-center gap-1`}>
      <LockOutlined aria-hidden />
      Final, the job is invoiced. Credit the invoice first to change it.
    </p>
  );
}
