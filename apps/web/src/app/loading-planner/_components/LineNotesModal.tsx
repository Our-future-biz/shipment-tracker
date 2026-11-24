"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Input } from "antd";
import { AppModal } from "@/components/AppModal";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import type { DraftLine } from "../_lib/cargoForm";
import { dgProblem, LASHING_MAX } from "../_lib/dangerous";

interface LineNotesModalProps {
  /** The line being edited; null keeps the dialog closed. */
  line: DraftLine | null;
  label: string;
  onClose: () => void;
  onSave: (patch: Pick<DraftLine, "dg" | "un" | "dgClass" | "lashing">) => void;
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
  useEffect(() => {
    if (!line) return;
    setDg(line.dg === true || !!line.un || !!line.dgClass);
    setUn(line.un ?? "");
    setDgClass(line.dgClass ?? "");
    setLashing(line.lashing ?? "");
    // Only opening for a line sets this off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);
  const problem = dg ? dgProblem(un, dgClass) : null;

  const save = () => {
    // Not dangerous: the mark, the UN number and the class go together.
    onSave({ dg: dg || undefined, un: dg && un.trim() ? un.trim() : undefined, dgClass: dg && dgClass.trim() ? dgClass.trim().toUpperCase() : undefined, lashing: lashing.trim() || undefined });
    onClose();
  };

  return (
    <AppModal
      open={line !== null}
      onClose={onClose}
      title={`Dangerous goods and lashing · ${label}`}
      subtitle="Shown on the line and printed on the plan. The planner does not plan by them."
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
