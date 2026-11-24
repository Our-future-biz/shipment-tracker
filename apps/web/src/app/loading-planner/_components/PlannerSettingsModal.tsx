"use client";

import { useEffect, useState } from "react";
import { Button, InputNumber } from "antd";
import { AppModal } from "@/components/AppModal";
import { usePlannerSettings } from "@/hooks/usePlannerSettings";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { CONTAINERS, DEFAULT_RULES, MAX_CLEARANCE_MM, passHeight, passWidth, usableLength } from "../_lib/containers";
import { draftOf, heavyOrderWrong, rulesOf, sameAsStored, type OptionalField, type SettingsDraft, type SettingsField } from "../_lib/settingsForm";

interface PlannerSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface Field {
  key: SettingsField | OptionalField;
  /** May be left empty: no figure, no warning. */
  optional?: true;
  label: string;
  hint: string;
  unit: "mm" | "kg";
  min: number;
  max: number;
}

const GROUPS: { title: string; about: string; fields: Field[] }[] = [
  {
    title: "Clearance in standard containers",
    about: "The room the planner leaves free. A piece that does not pass with it goes to an open top or flat rack.",
    fields: [
      { key: "doorWidthMm", label: "Door width", hint: "Free beside a piece passing the door", unit: "mm", min: 0, max: MAX_CLEARANCE_MM },
      { key: "doorHeightMm", label: "Door height", hint: "Free above a piece passing the door", unit: "mm", min: 0, max: MAX_CLEARANCE_MM },
      { key: "lengthMm", label: "Length", hint: "Free along the floor, between the cargo and the doors", unit: "mm", min: 0, max: MAX_CLEARANCE_MM },
    ],
  },
  {
    title: "Out-of-gauge warnings",
    about: "On an open top or flat rack. Cargo beyond these is still planned, with a warning to check with the carrier.",
    fields: [
      { key: "oogWidthMm", label: "Width", hint: "Warn when a piece is wider", unit: "mm", min: 2400, max: 10000 },
      { key: "oogOverEndMm", label: "Over one end", hint: "Warn when a piece sticks out further over an end", unit: "mm", min: 0, max: 10000 },
      { key: "oogHeightMm", label: "Cargo height", hint: "Warn when the cargo stands higher above the floor", unit: "mm", min: 2000, max: 10000 },
    ],
  },
  {
    title: "Heavy single pieces in standard containers",
    about: "A piece heavier than the second figure is planned onto an open top or flat rack; so is a heavy piece whose bedding would be more than twice its length.",
    fields: [
      { key: "warnKg", label: "Warn from", hint: "A heavier piece gets “check how it is stuffed”", unit: "kg", min: 500, max: 35000 },
      { key: "moveKg", label: "Move from", hint: "A heavier piece leaves standard containers", unit: "kg", min: 500, max: 35000 },
    ],
  },
  {
    title: "Road weight",
    about: "The gross weight - the cargo with the empty container - above which a plan warns to check the inland leg. Leave a field empty for no warning.",
    fields: [
      { key: "gross20Kg", label: "20' gross", hint: "Warn when a 20' weighs more with its cargo", unit: "kg", min: 5000, max: 60000, optional: true },
      { key: "gross40Kg", label: "40' and 45' gross", hint: "Warn when a 40' or 45' weighs more with its cargo", unit: "kg", min: 5000, max: 60000, optional: true },
    ],
  },
];
const mm = (value: number) => `${value.toLocaleString("en-US")} mm`;
const EXAMPLE = CONTAINERS.find((c) => c.id === "40hc");

// Loading Planner → Settings: what every plan of the company is worked out with, and the road weight it warns from. Everyone sees the
// figures; managers and admins change them. Sizes are always in mm here, weights in kg.
export function PlannerSettingsModal({ open, onClose }: PlannerSettingsModalProps) {
  const { rules, changed, canEdit, isLoading, isError, saveRules, isSaving } = usePlannerSettings();
  const message = useMessages();
  const [draft, setDraft] = useState<SettingsDraft>(() => draftOf(rules));
  // The stored figures fill the form each time it opens.
  useEffect(() => {
    if (open) setDraft(draftOf(rules));
    // Only opening sets this off; the figures do not change under an open form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading]);

  const filled = rulesOf(draft);
  const same = sameAsStored(draft, rules);
  const wrongOrder = heavyOrderWrong(filled);

  const handleSave = async () => {
    if (!filled) return;
    try {
      await saveRules(filled);
      message.success("Settings saved. Open plans are worked out again with them.");
      onClose();
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  // What the clearance means on a 40' HC, so the numbers are not abstract.
  const example = filled && EXAMPLE ? { ...EXAMPLE, clear: filled.clearance } : null;

  return (
    <AppModal
      open={open}
      onClose={isSaving ? () => undefined : onClose}
      title="Loading Planner settings"
      subtitle="What every plan of the company is worked out with."
      size="large"
      footer={
        <div className="flex justify-end gap-2">
          {canEdit && (
            <Button className="mr-auto" disabled={isSaving} onClick={() => setDraft(draftOf(DEFAULT_RULES))}>
              Starting figures
            </Button>
          )}
          <Button onClick={onClose} disabled={isSaving}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button type="primary" loading={isSaving} disabled={!filled || same || wrongOrder} onClick={handleSave}>
              Save
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {isError && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            The settings could not be read. The planner works with the starting figures until they can.
          </p>
        )}
        {GROUPS.map((group, index) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h3 className="m-0 text-[14px] font-semibold text-slate-900">{group.title}</h3>
            <p className={`${HINT} m-0`}>{group.about}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {group.fields.map(({ key, label, hint, unit, min, max, optional }) => (
                <label key={key} className="flex flex-col gap-1.5">
                  <span className={LABEL_TEXT}>
                    {label} ({unit})
                  </span>
                  <InputNumber
                    aria-label={`${group.title}: ${label.toLowerCase()} in ${unit}`}
                    min={min}
                    max={max}
                    precision={0}
                    controls={false}
                    placeholder={optional ? "No warning" : undefined}
                    disabled={!canEdit || isLoading}
                    value={draft[key]}
                    onChange={(value) => setDraft({ ...draft, [key]: value })}
                    className="!w-full"
                  />
                  <span className={HINT}>{hint}</span>
                </label>
              ))}
            </div>
            {index === 0 && example && (
              <p className="m-0 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
                With these figures a {example.name} takes a piece up to {mm(passWidth(example))} wide and {mm(passHeight(example))} high, and cargo over{" "}
                {mm(usableLength(example))} of its {mm(example.internalL)} floor.
              </p>
            )}
            {index === 2 && wrongOrder && (
              <p className="m-0 text-[13px] text-red-600" role="alert">
                “Move from” cannot be below “Warn from”.
              </p>
            )}
          </section>
        ))}
        <p className={`${HINT} m-0`}>
          {canEdit ? "" : "Managers and admins change these figures. "}
          {changed ? "" : "These are the starting figures; nobody has changed them yet. "}
          Saved plans are not changed, but they are worked out with the figures of the day they are opened.
        </p>
      </div>
    </AppModal>
  );
}
