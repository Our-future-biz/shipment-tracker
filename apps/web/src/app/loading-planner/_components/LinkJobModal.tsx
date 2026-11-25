"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AutoComplete, Button, Checkbox, Select } from "antd";
import { AppModal } from "@/components/AppModal";
import { useDebounced } from "@/hooks/useDebounced";
import { api, apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { JobNotFound, type PlanJob } from "@/hooks/useLoadingPlanJob";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { JOB_KIND_LABEL } from "../_lib/jobCargo";
import { highlightsOption, linksOnEnter } from "../_lib/linkEnter";

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

// Links the plan to a shipment (by its job number) or a quote (by its reference), found as you type, and, if ticked,
// takes the job's cargo into the plan.
export function LinkJobModal({ open, onClose, readJob, onLinked, hasCargo }: LinkJobModalProps) {
  const [kind, setKind] = useState<interfaces.PlanLinkKind>("shipment");
  const [key, setKey] = useState("");
  const [loadCargo, setLoadCargo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The jobs the typing finds (Council Outlay 14, P5): the main search's own answers, to pick from instead of typing the number out.
  const typed = useDebounced(key.trim(), 300);
  const found = useQuery({
    queryKey: ["loading-plan-link-search", kind, typed],
    queryFn: async () =>
      kind === "shipment"
        ? (await api.shipments.searchShipments({ q: typed, limit: 8 })).items.map((s) => ({ value: s.jobNumber, label: [s.jobNumber, s.customer, [s.pol, s.pod].filter(Boolean).join(" → ")].filter(Boolean).join(" · ") }))
        : (await api.quotes.searchQuotes({ q: typed, limit: 8 })).items.map((x) => ({ value: x.quoteNumber, label: [x.quoteNumber, x.customerName, [x.pol, x.pod].filter(Boolean).join(" → ")].filter(Boolean).join(" · ") })),
    enabled: open && typed.length >= 2,
    staleTime: 30_000,
  });

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
      onClose={busy ? () => undefined : close}
      title="Link to a shipment or quote"
      subtitle="The plan then shows on that shipment or quote. Linking changes nothing on the job."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="primary" loading={busy} onClick={handleLink}>
            Link
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>Shipment or quote</span>
          <Select value={kind} options={KIND_OPTIONS} onChange={setKind} aria-label="Shipment or quote" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_TEXT}>{kind === "shipment" ? "Job number" : "Quote reference"}</span>
          <AutoComplete
            autoFocus
            value={key}
            options={(found.data ?? []).filter((o) => o.value)}
            placeholder={kind === "shipment" ? "Job number, customer or port, e.g. CZ00000053" : "Quote reference or customer, e.g. QCZ00000012"}
            maxLength={60}
            aria-label={kind === "shipment" ? "Job number" : "Quote reference"}
            notFoundContent={typed.length >= 2 && !found.isFetching && found.isSuccess ? "Nothing found: type the number as it is" : null}
            onChange={(value) => {
              setKey(value);
              setError(null);
            }}
            // Enter links what is typed, unless it picks a highlighted job from the list instead.
            onInputKeyDown={(e) => {
              const offered = (found.data ?? []).map((o) => o.value);
              if (e.key === "Enter" && linksOnEnter(key, offered, highlightsOption(e.currentTarget.getAttribute("aria-activedescendant")))) void handleLink();
            }}
          />
          <span className={HINT}>Type a few letters and pick the {JOB_KIND_LABEL[kind].toLowerCase()} from the list, or type its number in full.</span>
        </label>
        <Checkbox checked={loadCargo} onChange={(e) => setLoadCargo(e.target.checked)}>
          Load the {JOB_KIND_LABEL[kind].toLowerCase()}&apos;s cargo into the plan
        </Checkbox>
        {loadCargo && hasCargo && <p className={`${HINT} m-0`}>The cargo lines now in the plan will be replaced.</p>}
        {error && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </AppModal>
  );
}
