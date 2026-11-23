"use client";

import { useEffect, useState } from "react";
import { Button, InputNumber } from "antd";
import { AppModal } from "@/components/AppModal";
import { useCoLoadingInlandWeight } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";

interface InlandWeightModalProps {
  open: boolean;
  onClose: () => void;
  service: { id: string; name: string; inlandWeightKg: number | null };
}

// A service's inland weight: a lower cargo weight for the leg between the port and the hub, where
// the road or the rail takes less than the box does. A box of the service is then full at it.
// Left empty, a box is full at its own weight limit. Set by managers.
export function InlandWeightModal({ open, onClose, service }: InlandWeightModalProps) {
  const save = useCoLoadingInlandWeight(service.id);
  const message = useMessages();
  const [kg, setKg] = useState<number | null>(service.inlandWeightKg);
  useEffect(() => {
    if (open) setKg(service.inlandWeightKg);
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    try {
      await save.mutateAsync(kg);
      message.success(kg === null ? `No inland weight on "${service.name}" any more` : `Inland weight of "${service.name}" set to ${kg.toLocaleString("en-US")} kg`);
      onClose();
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onClose={save.isPending ? () => undefined : onClose}
      title="Inland weight"
      subtitle={`The most cargo a box of "${service.name}" may carry on the leg between the port and the hub.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="primary" loading={save.isPending} disabled={kg === service.inlandWeightKg} onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex max-w-[260px] flex-col gap-1.5">
          <span className={LABEL_TEXT}>Inland weight (kg)</span>
          <InputNumber
            autoFocus
            aria-label="Inland weight in kg"
            min={1000}
            max={50000}
            precision={0}
            controls={false}
            placeholder="none"
            value={kg}
            onChange={setKg}
            className="!w-full"
          />
          <span className={HINT}>From 1,000 to 50,000 kg. Leave it empty for no inland limit.</span>
        </label>
        <p className={`${HINT} m-0`}>
          Where it is below a box&apos;s own weight limit, Box utilization is full at this weight on every sailing of the service. Where it is above, nothing changes.
        </p>
      </div>
    </AppModal>
  );
}
