"use client";

import { useEffect, useState } from "react";
import { Button, InputNumber } from "antd";
import { AppModal } from "@/components/AppModal";
import { useCoLoadingSettings } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";

const START_PCT = 85;
/** What the share means on three common boxes: their inside volumes in cbm. */
const EXAMPLES: [string, number][] = [
  ["20' DC", 33.1],
  ["40' DC", 67.5],
  ["40' HC", 76.4],
];

// Co-Loading Concept → Settings: the share of a box's inside volume the company plans with. Mixed
// cargo never fills the whole box, so Box utilization measures against this planning volume.
// Everyone sees the figure; managers and admins change it.
export function CoLoadingSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, isLoading, isError, save } = useCoLoadingSettings();
  const message = useMessages();
  const stored = settings?.planningVolumePct ?? START_PCT;
  const canEdit = settings?.canEdit ?? false;
  const [pct, setPct] = useState<number | null>(stored);
  // The stored figure fills the form each time it opens.
  useEffect(() => {
    if (open) setPct(stored);
    // Only opening sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading]);

  const handleSave = async () => {
    if (pct === null) return;
    try {
      await save.mutateAsync(pct);
      message.success("Settings saved. Every box's fill is worked out again with them.");
      onClose();
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onClose={save.isPending ? () => undefined : onClose}
      title="Co-Loading settings"
      subtitle="How full a box is planned to, for every sailing of the company."
      footer={
        <div className="flex justify-end gap-2">
          {canEdit && (
            <Button className="mr-auto" disabled={save.isPending} onClick={() => setPct(START_PCT)}>
              Starting figure
            </Button>
          )}
          <Button onClick={onClose} disabled={save.isPending}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button type="primary" loading={save.isPending} disabled={pct === null || pct === stored} onClick={handleSave}>
              Save
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {isError && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            The settings could not be read. Boxes are planned to {START_PCT}% until they can.
          </p>
        )}
        <label className="flex max-w-[260px] flex-col gap-1.5">
          <span className={LABEL_TEXT}>Planning share of the inside volume (%)</span>
          <InputNumber
            aria-label="Planning share of a box's inside volume in percent"
            min={50}
            max={100}
            precision={0}
            controls={false}
            disabled={!canEdit || isLoading}
            value={pct}
            onChange={setPct}
            className="!w-full"
          />
          <span className={HINT}>From 50 to 100. Box utilization is full at this share of the box.</span>
        </label>
        {pct !== null && (
          <p className="m-0 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
            At {pct}%:{" "}
            {EXAMPLES.map(([name, inside]) => `a ${name} is planned to ${(Math.round(inside * pct) / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })} of ${inside} cbm`).join(", ")}.
          </p>
        )}
        <p className={`${HINT} m-0`}>
          {canEdit ? "" : "Managers and admins change this figure. "}
          {settings && !settings.changed ? "This is the starting figure; nobody has changed it yet. " : ""}
          A lower weight for the leg between the port and the hub is set per service, on the service&apos;s own page.
        </p>
      </div>
    </AppModal>
  );
}
