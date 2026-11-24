"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Input, InputNumber, Select } from "antd";
import { AppModal } from "@/components/AppModal";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import type { DraftLine } from "../_lib/cargoForm";
import { dgProblem, LASHING_MAX, PIN_BOX_MAX } from "../_lib/dangerous";

const END_OPTIONS = [
  { value: "", label: "Anywhere" },
  { value: "front", label: "At the front wall (loaded first, out last)" },
  { value: "doors", label: "At the doors (loaded last, out first)" },
];
const BOX_OPTIONS = [{ value: 0, label: "Any container" }, ...Array.from({ length: PIN_BOX_MAX }, (_, i) => ({ value: i + 1, label: `Container no. ${i + 1}` }))];

interface LineNotesModalProps {
  /** The line being edited; null keeps the dialog closed. */
  line: DraftLine | null;
  label: string;
  onClose: () => void;
  onSave: (patch: Pick<DraftLine, "dg" | "un" | "dgClass" | "lashing" | "pinEnd" | "pinBox" | "topLoadKg">) => void;
}

// A cargo line's dangerous goods and lashing note (Council Outlay 14, P11): its UN number and class,
// carried from the job or typed here, and a free note on how it is lashed. They are shown on the
// line and printed on the plan. The planner does not plan by them: it only warns when two classes
// share a container.
export function LineNotesModal({ line, label, onClose, onSave }: LineNotesModalProps) {
  const [dg, setDg] = useState(false);
  const [un, setUn] = useState("");
  const [dgClass, setDgClass] = useState("");
  const [lashing, setLashing] = useState("");
  const [pinEnd, setPinEnd] = useState<"" | "front" | "doors">("");
  const [pinBox, setPinBox] = useState(0);
  const [topLoad, setTopLoad] = useState<number | null>(null);
  useEffect(() => {
    if (!line) return;
    setDg(line.dg === true || !!line.un || !!line.dgClass);
    setUn(line.un ?? "");
    setDgClass(line.dgClass ?? "");
    setLashing(line.lashing ?? "");
    setPinEnd(line.pinEnd ?? "");
    setPinBox(line.pinBox ?? 0);
    setTopLoad(line.topLoadKg ?? null);
    // Only opening for a line sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);
  const problem = dg ? dgProblem(un, dgClass) : null;

  const save = () => {
    // Not dangerous: the mark, the UN number and the class go together.
    onSave({ dg: dg || undefined, un: dg && un.trim() ? un.trim() : undefined, dgClass: dg && dgClass.trim() ? dgClass.trim().toUpperCase() : undefined, lashing: lashing.trim() || undefined, pinEnd: pinEnd || undefined, pinBox: pinBox || undefined, topLoadKg: topLoad && topLoad > 0 ? topLoad : undefined });
    onClose();
  };

  return (
    <AppModal
      open={line !== null}
      onClose={onClose}
      title={`Pins, stacking, dangerous goods and lashing · ${label}`}
      subtitle="Where the line goes in the plan, and what is shown and printed about it."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" disabled={problem !== null} onClick={save}>
            Done
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Pins (Council Outlay 14, P8): the planner places pinned lines first and plans the rest around them. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_TEXT}>Place in the container</span>
            <Select aria-label="Place in the container" value={pinEnd} options={END_OPTIONS} onChange={setPinEnd} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_TEXT}>Container</span>
            <Select aria-label="Container number" value={pinBox} options={BOX_OPTIONS} onChange={setPinBox} />
          </label>
        </div>
        <p className={`${HINT} m-0 -mt-2`}>
          Lines with the same container number travel in one container, and lines with different numbers in different ones; pinned containers come first in the plan. What does not fit its
          pinned container is listed as not loaded, never moved to another one. A plan with a line pinned to an end is not rearranged for balance.
        </p>
        {/* Mixed stacking (Council Outlay 14, P9): what a piece of this line bears on top. */}
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Carries on top (kg)</span>
          <InputNumber aria-label="Weight a piece carries on top, in kg" className="!w-[200px]" min={0} max={1000000} precision={0} controls={false} placeholder="None" value={topLoad} onChange={setTopLoad} />
          <span className={HINT}>
            With a weight here, other cargo - of this line or another - may stand on a piece of this line, as long as it rests on it whole and weighs no more. The floor is filled first. Left
            empty, a piece carries only its own kind, when the line is ticked Stackable.
          </span>
        </label>
        <Checkbox checked={dg} onChange={(e) => setDg(e.target.checked)}>
          Dangerous goods
        </Checkbox>
        {dg && (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_TEXT}>UN number</span>
              <Input aria-label="UN number" placeholder="e.g. 1263" maxLength={4} value={un} onChange={(e) => setUn(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_TEXT}>Class</span>
              <Input aria-label="Dangerous goods class" placeholder="e.g. 3, 2.1 or 1.4S" maxLength={5} value={dgClass} onChange={(e) => setDgClass(e.target.value)} />
            </label>
          </div>
        )}
        {problem && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            {problem}
          </p>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Lashing note</span>
          <Input.TextArea aria-label="Lashing note" rows={2} maxLength={LASHING_MAX} showCount placeholder="e.g. 2 belts across, chocks at both ends" value={lashing} onChange={(e) => setLashing(e.target.value)} />
        </label>
        <p className={`${HINT} m-0`}>Two classes of dangerous goods in one container are warned about on the plan; nothing is refused. The carrier and the IMDG Code decide what may travel together.</p>
      </div>
    </AppModal>
  );
}
