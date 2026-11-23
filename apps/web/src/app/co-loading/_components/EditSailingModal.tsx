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
// Box utilization - and its cut-off, the day cargo must be in by. Past the cut-off, linking a
// shipment is remarked on, never refused. Anyone changes these; nothing while the service is closed.
export function EditSailingModal({ open, onClose, sailing }: { open: boolean; onClose: () => void; sailing: CoLoadingSailing }) {
  const save = useSailingDetails(sailing.id);
  const message = useMessages();
  const [count, setCount] = useState<number | null>(sailing.containerCount);
  const [cutoff, setCutoff] = useState(sailing.cutoffDate ?? "");
  useEffect(() => {
    if (!open) return;
    setCount(sailing.containerCount);
    setCutoff(sailing.cutoffDate ?? "");
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const same = count === sailing.containerCount && cutoff === (sailing.cutoffDate ?? "");
  const handleSave = async () => {
    if (count === null) return;
    try {
      await save.mutateAsync({ containerCount: count, cutoffDate: cutoff || null });
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
      subtitle={`Its ${sailing.containerType} containers and its cut-off.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="primary" loading={save.isPending} disabled={count === null || same} onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Containers ({sailing.containerType})</span>
          <InputNumber aria-label="Number of containers" min={1} max={20} precision={0} value={count} onChange={setCount} className="!w-full" />
          <span className={HINT}>From 1 to 20. Box utilization adds their capacity up.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Cut-off</span>
          <Input type="date" aria-label="Cut-off date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} allowClear />
          <span className={HINT}>The day cargo must be in by. Leave it empty for none.</span>
        </label>
      </div>
    </AppModal>
  );
}
