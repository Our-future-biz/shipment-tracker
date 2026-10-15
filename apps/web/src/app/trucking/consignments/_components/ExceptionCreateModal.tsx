"use client";

import { useState } from "react";
import { Input, InputNumber, Modal, Select } from "antd";
import type { ExceptionCause, ExceptionCreate, ExceptionCurrency, ExceptionKind, FailedReason } from "@/hooks/useTruckingControl";
import type { ConsignmentDetail } from "@/hooks/useTruckingConsignments";
import { CAUSE_LABELS, EXCEPTION_KIND_LABELS, FAILED_REASON_LABELS, PIECE_KINDS, exceptionDraftProblems, waitingText } from "../../_lib/exceptions";
import { CURRENCIES } from "../../_lib/hauliers";
import { TruckingField } from "../../_components/TruckingField";

const options = <K extends string>(labels: Record<K, string>) => (Object.keys(labels) as K[]).map((k) => ({ value: k, label: labels[k] }));
const KIND_OPTIONS = options(EXCEPTION_KIND_LABELS);
const REASON_OPTIONS = options(FAILED_REASON_LABELS);
const CAUSE_OPTIONS = options(CAUSE_LABELS);
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

interface ExceptionCreateModalProps {
  c: ConsignmentDetail;
  /** Free waiting time of the consignment's scope (Trucking settings). */
  freeMinutes: number;
  onClose: () => void;
  /** Rejects to keep the dialog open (the caller reports the error). */
  onCreate: (req: ExceptionCreate) => Promise<unknown>;
}

// Raises a delivery exception: what happened, on which leg, its likely cause and any amount known.
// Who bears it is decided afterwards (Decide…).
export const ExceptionCreateModal = ({ c, freeMinutes, onClose, onCreate }: ExceptionCreateModalProps) => {
  const [kind, setKind] = useState<ExceptionKind>("FAILED_DELIVERY");
  const [failedReason, setFailedReason] = useState<FailedReason | null>(null);
  const [cause, setCause] = useState<ExceptionCause>("UNKNOWN");
  const [description, setDescription] = useState("");
  const [pieces, setPieces] = useState<number | null>(null);
  const [waitingMinutes, setWaitingMinutes] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<ExceptionCurrency>("CZK");
  const [legId, setLegId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const counted = PIECE_KINDS.includes(kind);
  const waiting = kind === "WAITING_TIME";
  const problems = exceptionDraftProblems({ kind, failedReason, description, pieces, waitingMinutes });

  const handleOk = async () => {
    setBusy(true);
    try {
      await onCreate({
        kind,
        failedReason: kind === "FAILED_DELIVERY" ? failedReason : null,
        cause,
        description: description.trim(),
        pieces: counted ? pieces : null,
        waitingMinutes: waiting ? waitingMinutes : null,
        amount,
        currency,
        legId,
      });
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`New exception on ${c.ref}`} okText="Raise exception" okButtonProps={{ disabled: problems.length > 0 }} confirmLoading={busy} onOk={handleOk} onCancel={onClose} destroyOnHidden width={560}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TruckingField label="What happened">
            <Select aria-label="Exception kind" value={kind} options={KIND_OPTIONS} onChange={setKind} />
          </TruckingField>
          {kind === "FAILED_DELIVERY" && (
            <TruckingField label="Why it failed">
              <Select aria-label="Failed delivery reason" value={failedReason} placeholder="Choose" options={REASON_OPTIONS} onChange={setFailedReason} />
            </TruckingField>
          )}
          {counted && (
            <TruckingField label="Pieces">
              <InputNumber aria-label="Pieces" min={1} precision={0} value={pieces} onChange={(v) => setPieces(v ?? null)} className="w-full" />
            </TruckingField>
          )}
          {waiting && (
            <TruckingField label="Minutes waited" hint={waitingText(waitingMinutes, freeMinutes)}>
              <InputNumber aria-label="Minutes waited" min={1} precision={0} step={15} value={waitingMinutes} onChange={(v) => setWaitingMinutes(v ?? null)} className="w-full" />
            </TruckingField>
          )}
          <TruckingField label="Likely cause">
            <Select aria-label="Cause" value={cause} options={CAUSE_OPTIONS} onChange={setCause} />
          </TruckingField>
          {c.legs.length > 0 && (
            <TruckingField label="Leg">
              <Select
                aria-label="Leg"
                allowClear
                placeholder="The whole consignment"
                value={legId}
                options={c.legs.map((l) => ({ value: l.id, label: `${l.seq}. ${l.fromText} → ${l.toText}${l.tripRef ? ` (${l.tripRef})` : ""}` }))}
                onChange={(v) => setLegId(v ?? null)}
              />
            </TruckingField>
          )}
          <TruckingField label="Amount (if known)" hint={waiting ? "Left empty, it may be priced from the tariff's waiting-time surcharge" : undefined}>
            <div className="flex gap-2">
              <InputNumber aria-label="Amount" min={0} value={amount} onChange={(v) => setAmount(v ?? null)} className="flex-1" />
              <Select aria-label="Currency" value={currency} options={CURRENCY_OPTIONS} onChange={setCurrency} className="w-[84px]" />
            </div>
          </TruckingField>
        </div>
        <TruckingField label="Description">
          <Input.TextArea aria-label="Description" autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </TruckingField>
        {kind === "FAILED_DELIVERY" && (
          <p className="m-0 text-[11.5px] text-slate-500">A failed delivery puts the consignment back to Out for delivery: it then needs a redelivery or a return.</p>
        )}
        <p className="m-0 text-[11.5px] text-slate-500">Until it is decided and closed, the consignment cannot become Ready to bill. Photos are added afterwards.</p>
      </div>
    </Modal>
  );
};
