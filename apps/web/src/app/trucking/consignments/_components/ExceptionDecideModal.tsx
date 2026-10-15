"use client";

import { useState } from "react";
import { Input, InputNumber, Modal, Select } from "antd";
import type { DeliveryException, ExceptionCause, ExceptionCurrency, ExceptionDecide, ExceptionDecision } from "@/hooks/useTruckingControl";
import { CAUSE_LABELS, DECISION_LABELS, EXCEPTION_KIND_LABELS, decisionChoices, decisionState } from "../../_lib/exceptions";
import { CURRENCIES } from "../../_lib/hauliers";
import { TruckingField } from "../../_components/TruckingField";

const CAUSE_OPTIONS = (Object.keys(CAUSE_LABELS) as ExceptionCause[]).map((k) => ({ value: k, label: CAUSE_LABELS[k] }));
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

interface ExceptionDecideModalProps {
  exception: DeliveryException;
  manager: boolean;
  internal: boolean;
  jobNumber: string;
  onClose: () => void;
  /** Rejects to keep the dialog open (the caller reports the error). */
  onDecide: (req: ExceptionDecide) => Promise<unknown>;
}

// Decides who bears an exception. A manager may charge the customer, claim from the haulier or
// absorb a cost; anyone else may only absorb it at no cost. The reason is kept.
export const ExceptionDecideModal = ({ exception, manager, internal, jobNumber, onClose, onDecide }: ExceptionDecideModalProps) => {
  const choices = decisionChoices(manager);
  const [decision, setDecision] = useState<ExceptionDecision>(choices.includes(exception.decision as (typeof choices)[number]) ? exception.decision : choices[0]!);
  const [cause, setCause] = useState<ExceptionCause>(exception.cause);
  const [amount, setAmount] = useState<number | null>(manager ? exception.amount : 0);
  const [currency, setCurrency] = useState<ExceptionCurrency>(exception.currency);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const state = decisionState(decision, amount, manager, reason);

  const effect: Record<ExceptionDecision, string> = {
    CHARGE_CUSTOMER: internal ? "The amount is added to this consignment's internal charge." : `A selling line is added to job ${jobNumber}.`,
    CLAIM_HAULIER: "A claim against the haulier: taken off its expected cost when its invoice is matched (shown apart).",
    ABSORB: "We bear it; nothing is charged or claimed.",
    PENDING: "",
  };

  const handleOk = async () => {
    setBusy(true);
    try {
      await onDecide({ decision, cause, amount, currency, reason: reason.trim() });
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Decide: ${EXCEPTION_KIND_LABELS[exception.kind]}`}
      okText="Save decision"
      okButtonProps={{ disabled: !state.allowed }}
      confirmLoading={busy}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TruckingField label="Decision">
            <Select aria-label="Decision" value={decision} options={choices.map((d) => ({ value: d, label: DECISION_LABELS[d] }))} onChange={setDecision} />
          </TruckingField>
          <TruckingField label="Cause">
            <Select aria-label="Cause" value={cause} options={CAUSE_OPTIONS} onChange={setCause} />
          </TruckingField>
          <TruckingField label="Amount">
            <div className="flex gap-2">
              <InputNumber aria-label="Amount" min={0} value={amount} disabled={!manager} onChange={(v) => setAmount(v ?? null)} className="flex-1" />
              <Select aria-label="Currency" value={currency} options={CURRENCY_OPTIONS} disabled={!manager} onChange={setCurrency} className="w-[84px]" />
            </div>
          </TruckingField>
        </div>
        <p className="m-0 text-[12px] text-slate-600">{effect[decision]}</p>
        <TruckingField label="Reason">
          <Input.TextArea aria-label="Reason" autoSize={{ minRows: 2, maxRows: 5 }} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </TruckingField>
        {!manager && <p className="m-0 text-[11.5px] text-slate-500">Charging the customer, claiming from the haulier or absorbing a cost above 0 is a manager&apos;s decision.</p>}
        {!state.allowed && reason.trim().length >= 3 && <p className="m-0 text-[12px] text-red-600">{state.reason}</p>}
      </div>
    </Modal>
  );
};
