"use client";

import { useEffect, useState } from "react";
import { Button, InputNumber } from "antd";
import { AppModal } from "@/components/AppModal";
import { usePlannerSettings } from "@/hooks/usePlannerSettings";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { CONTAINERS, DEFAULT_CLEARANCE, MAX_CLEARANCE_MM, passHeight, passWidth, usableLength, type Clearance } from "../_lib/containers";

interface PlannerSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const FIELDS: { key: keyof Clearance; label: string; hint: string }[] = [
  { key: "doorWidthMm", label: "Door width", hint: "Free beside a piece passing the door" },
  { key: "doorHeightMm", label: "Door height", hint: "Free above a piece passing the door" },
  { key: "lengthMm", label: "Length", hint: "Free along the floor, between the cargo and the doors" },
];

const mm = (value: number) => `${value.toLocaleString("en-US")} mm`;
const EXAMPLE = CONTAINERS.find((c) => c.id === "40hc");

// Loading Planner → Settings: the clearance every plan of the company leaves in a standard
// container. Everyone sees the figures; managers and admins change them. They are always in mm.
export function PlannerSettingsModal({ open, onClose }: PlannerSettingsModalProps) {
  const { clearance, changed, canEdit, isLoading, isError, saveClearance, isSaving } = usePlannerSettings();
  const message = useMessages();
  const [draft, setDraft] = useState<Record<keyof Clearance, number | null>>(clearance);
  // The stored figures fill the form each time it opens.
  useEffect(() => {
    if (open) setDraft(clearance);
    // Only opening sets this off; the figures do not change under an open form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading]);

  const whole = FIELDS.every(({ key }) => draft[key] !== null);
  const figures = whole ? (draft as Clearance) : null;
  const same = figures !== null && FIELDS.every(({ key }) => figures[key] === clearance[key]);

  const handleSave = async () => {
    if (!figures) return;
    try {
      await saveClearance(figures);
      message.success("Clearance saved. Open plans are worked out again with it.");
      onClose();
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  // What the figures mean on a 40' HC, so the numbers are not abstract.
  const example = figures && EXAMPLE ? { ...EXAMPLE, clear: figures } : null;

  return (
    <AppModal
      open={open}
      onClose={isSaving ? () => undefined : onClose}
      title="Loading Planner settings"
      subtitle="Clearance in standard containers: the room the planner leaves free, for every plan of the company."
      footer={
        <div className="flex justify-end gap-2">
          {canEdit && (
            <Button className="mr-auto" disabled={isSaving} onClick={() => setDraft(DEFAULT_CLEARANCE)}>
              Starting figures
            </Button>
          )}
          <Button onClick={onClose} disabled={isSaving}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button type="primary" loading={isSaving} disabled={!figures || same} onClick={handleSave}>
              Save
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {isError && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            The settings could not be read. The planner works with the starting figures until they can.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FIELDS.map(({ key, label, hint }) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className={LABEL_TEXT}>{label} (mm)</span>
              <InputNumber
                aria-label={`Clearance on ${label.toLowerCase()} in mm`}
                min={0}
                max={MAX_CLEARANCE_MM}
                precision={0}
                controls={false}
                disabled={!canEdit || isLoading}
                value={draft[key]}
                onChange={(value) => setDraft({ ...draft, [key]: value })}
                className="!w-full"
              />
              <span className={HINT}>{hint}</span>
            </label>
          ))}
        </div>
        {example && (
          <p className="m-0 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
            With these figures a {example.name} takes a piece up to {mm(passWidth(example))} wide and {mm(passHeight(example))} high, and cargo over {mm(usableLength(example))} of
            its {mm(example.internalL)} floor. A larger piece is planned into an open top or onto a flat rack.
          </p>
        )}
        <p className={`${HINT} m-0`}>
          {canEdit ? "From 0 to 500 mm each. " : "Managers and admins change these figures. "}
          {changed ? "" : "These are the starting figures; nobody has changed them yet. "}
          Open tops and flat racks are not affected. Saved plans are not changed, but they are worked out with the figures of the day they are opened.
        </p>
      </div>
    </AppModal>
  );
}
