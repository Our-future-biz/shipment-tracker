"use client";

import { useEffect, useState } from "react";
import { Button, Input, InputNumber } from "antd";
import { AppModal } from "@/components/AppModal";
import { useSailingDetails, type CoLoadingSailing } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { sailingTitle } from "../_lib/sailings";

// "Edit sailing": how many containers of its type the sailing has - their capacity is added up in
// Box utilization - its cut-off, the day cargo must be in by, and its departure date, whose ČNB
// rates value its box costs on Earnings. Past the cut-off, linking a shipment is remarked on, never
// refused. Anyone changes these - but once a container has box costs, only managers and admins
// change the number of containers and the departure date (below); nothing while the service is closed.
export function EditSailingModal({ open, onClose, sailing, isManager }: { open: boolean; onClose: () => void; sailing: CoLoadingSailing; isManager: boolean }) {
  // Once a container has box costs, the number of containers and the departure date move the
  // managers' figures: only they change them (Council Review 7, K13).
  const costed = sailing.costedContainers ?? [];
  const locked = costed.length > 0 && !isManager;
  const save = useSailingDetails(sailing.id);
  const message = useMessages();
  const [count, setCount] = useState<number | null>(sailing.containerCount);
  const [cutoff, setCutoff] = useState(sailing.cutoffDate ?? "");
  const [departure, setDeparture] = useState(sailing.departureDate ?? "");
  useEffect(() => {
    if (!open) return;
    setCount(sailing.containerCount);
    setCutoff(sailing.cutoffDate ?? "");
    setDeparture(sailing.departureDate ?? "");
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const same = count === sailing.containerCount && cutoff === (sailing.cutoffDate ?? "") && departure === (sailing.departureDate ?? "");
  const wrongOrder = !!cutoff && !!departure && cutoff > departure;
  // Costs of a container the sailing would no longer have are kept and not counted: said before saving.
  const dropped = count === null ? [] : costed.filter((n) => n > count);
  const handleSave = async () => {
    if (count === null) return;
    try {
      await save.mutateAsync({ containerCount: count, cutoffDate: cutoff || null, departureDate: departure || null });
      message.success(`Sailing ${sailingTitle(sailing)} saved`);
      onClose();
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onClose={save.isPending ? () => undefined : onClose}
      title={`Edit sailing ${sailingTitle(sailing)}`}
      subtitle={`Its ${sailing.containerType} containers, its cut-off and its departure date.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="primary" loading={save.isPending} disabled={count === null || same || wrongOrder} onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Containers ({sailing.containerType})</span>
          <InputNumber aria-label="Number of containers" min={1} max={20} precision={0} value={count} onChange={setCount} disabled={locked} className="!w-full" />
          <span className={dropped.length > 0 ? "text-[12px] text-amber-700" : HINT} role={dropped.length > 0 ? "status" : undefined}>
            {dropped.length > 0
              ? `Container ${dropped.join(", ")} has box costs: they are kept but no longer counted, so the profit rises.`
              : "From 1 to 20. Box utilization adds their capacity up."}
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Cut-off</span>
          <Input type="date" aria-label="Cut-off date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} allowClear />
          <span className={HINT}>The day cargo must be in by. Leave it empty for none.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Departure date</span>
          <Input type="date" aria-label="Departure date" value={departure} onChange={(e) => setDeparture(e.target.value)} disabled={locked} allowClear />
          <span className={wrongOrder ? "text-[12px] text-red-600" : HINT} role={wrongOrder ? "alert" : undefined}>
            {wrongOrder ? "The cut-off cannot be after the departure date." : "The day the sailing leaves. Its exchange rates value the box costs on Earnings."}
          </span>
        </label>
        {locked && (
          <p className={`${HINT} col-span-full m-0`}>This sailing has box costs, so only managers and admins change its number of containers and its departure date.</p>
        )}
      </div>
    </AppModal>
  );
}
