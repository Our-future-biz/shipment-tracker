"use client";

import { Alert, Button } from "antd";
import { useRemeasureAcceptance } from "@/hooks/useRemeasureAcceptance";
import { chargeBasis, fmtChargeBasis } from "@/lib/chargeBasis";
import { formatDateTime } from "@/lib/date";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";

// Costs Breakdown after an accepted remeasurement (owner decision, 18 Nov 2026): the cargo changed,
// so what the freight is charged by changed (chargeable weight for air, W/M otherwise). The system
// never changes a cost line's quantity or price: this warning asks to check them, and stays until
// someone marks them checked - or comes back with the next accepted remeasurement.

const kg = (v: number) => (v > 0 ? `${v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : "—");
const cbm = (v: number) => (v > 0 ? `${v.toFixed(3)} CBM` : "—");

export function RemeasureCostsNotice({ shipmentId }: { shipmentId: string }) {
  const messageApi = useMessages();
  const { acceptance, markCostsChecked, isMarking } = useRemeasureAcceptance(shipmentId);
  if (!acceptance || acceptance.costsCheckedAt) return null;

  const { before, after, freightMode } = acceptance;
  const was = chargeBasis(freightMode, before.weightKg, before.volumeCbm);
  const now = chargeBasis(freightMode, after.weightKg, after.volumeCbm);
  const by = acceptance.acceptedBy ? ` by ${acceptance.acceptedBy}` : "";

  const onChecked = async () => {
    try {
      await markCostsChecked();
      messageApi.success("Marked as checked");
    } catch (e) {
      messageApi.error(`Not marked: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <Alert
      className="mb-4"
      type="warning"
      showIcon
      message={`Cargo changed by remeasurement: ${now.name} ${fmtChargeBasis(was)} → ${fmtChargeBasis(now)} — check the quantities`}
      description={
        <div className="space-y-1">
          <div>
            Accepted{by} on {formatDateTime(acceptance.acceptedAt)}. Weight {kg(before.weightKg)} → {kg(after.weightKg)} · Volume {cbm(before.volumeCbm)} → {cbm(after.volumeCbm)}. Cost quantities and prices are not changed by the system.
          </div>
          {acceptance.invoiced && <div className="font-medium">This job is already invoiced: a change of charges needs another invoice or a credit note.</div>}
        </div>
      }
      action={
        <Button size="small" onClick={onChecked} loading={isMarking}>
          Quantities checked
        </Button>
      }
    />
  );
}
