"use client";

import { useState } from "react";
import { Button, Checkbox, Input, Select } from "antd";
import { AppModal } from "@/components/AppModal";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { JobNotFound, type PlanJob } from "@/hooks/useLoadingPlanJob";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { JOB_KIND_LABEL } from "../_lib/jobCargo";

interface LinkJobModalProps {
  open: boolean;
  onClose: () => void;
  /** Looks the job up; throws with a sentence when there is none. */
  readJob: (job: { kind: interfaces.PlanLinkKind; key: string }) => Promise<PlanJob>;
  /** The job found, and whether its cargo is to replace the plan's cargo list. */
  onLinked: (job: PlanJob, loadCargo: boolean) => void;
  /** The plan already holds cargo, so loading the job's cargo replaces something. */
  hasCargo: boolean;
}

const KIND_OPTIONS = (["shipment", "quote"] as const).map((kind) => ({ value: kind, label: JOB_KIND_LABEL[kind] }));

// Links the plan to a shipment (by its job number) or a quote (by its reference), and, if ticked,
// takes the job's cargo into the plan.
export function LinkJobModal({ open, onClose, readJob, onLinked, hasCargo }: LinkJobModalProps) {
  const [kind, setKind] = useState<interfaces.PlanLinkKind>("shipment");
  const [key, setKey] = useState("");
  const [loadCargo, setLoadCargo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setKey("");
    setError(null);
    onClose();
  };

  const handleLink = async () => {
    if (!key.trim()) return setError(kind === "shipment" ? "Type the shipment's job number." : "Type the quote's reference.");
    setBusy(true);
    setError(null);
    try {
      onLinked(await readJob({ kind, key }), loadCargo);
      close();
    } catch (err) {
      setError(err instanceof JobNotFound ? err.message : apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={close}
      title="Link to a job"
      subtitle="The plan then shows on that shipment or quote. Linking changes nothing on the job."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" loading={busy} onClick={handleLink}>
            Link
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Kind of job</span>
          <Select value={kind} options={KIND_OPTIONS} onChange={setKind} aria-label="Kind of job" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>{kind === "shipment" ? "Job number" : "Quote reference"}</span>
          <Input
            value={key}
            placeholder={kind === "shipment" ? "e.g. CZ00000053" : "e.g. QCZ00000012"}
            maxLength={60}
            onChange={(e) => {
              setKey(e.target.value);
              setError(null);
            }}
            onPressEnter={handleLink}
          />
        </label>
        <Checkbox checked={loadCargo} onChange={(e) => setLoadCargo(e.target.checked)}>
          Load the job&apos;s cargo into the plan
        </Checkbox>
        {loadCargo && hasCargo && <p className={`${HINT} m-0`}>The cargo lines now in the plan will be replaced.</p>}
        {error && <p className="m-0 text-[13px] text-red-600">{error}</p>}
      </div>
    </AppModal>
  );
}
