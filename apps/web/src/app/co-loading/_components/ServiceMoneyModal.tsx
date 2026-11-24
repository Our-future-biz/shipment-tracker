"use client";

import { useEffect, useState } from "react";
import { Button, Input, InputNumber, Select } from "antd";
import { AppModal } from "@/components/AppModal";
import { useServiceMoney } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { BOX_COST_CURRENCIES, BOX_COST_LABEL, type BoxCostKind } from "../_lib/earnings";

const KINDS: BoxCostKind[] = ["origin", "ocean", "destination"];
interface Line {
  kind: BoxCostKind;
  amount: number | null;
  currency: string;
  note: string;
}
const EMPTY: Line[] = KINDS.map((kind) => ({ kind, amount: null, currency: "EUR", note: "" }));

// A service's money settings, for managers (Council Outlay 14, B4): the box costs a new sailing of
// the service starts with - Origin Costs, Ocean Freight and Destination Costs for each of its
// containers, which a manager then corrects on the sailing - and the least a shipment should earn
// per W/M before the box. Rows below that minimum are marked on Earnings; nothing is refused.
// Sailings that exist keep their own box costs.
export function ServiceMoneyModal({ open, onClose, service }: { open: boolean; onClose: () => void; service: { id: string; name: string } }) {
  const { money, isLoading, isError, save } = useServiceMoney(service.id, open);
  const message = useMessages();
  const [lines, setLines] = useState<Line[]>(EMPTY);
  const [floor, setFloor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What is stored fills the form when it opens, and once it is read.
  useEffect(() => {
    if (!open) return;
    setLines(KINDS.map((kind) => money?.defaultBoxCosts?.find((l) => l.kind === kind) ?? { kind, amount: null, currency: "EUR", note: "" }));
    setFloor(money?.minEarningPerWm ?? null);
    setError(null);
  }, [open, money]);
  const set = (kind: BoxCostKind, patch: Partial<Line>) => {
    setLines((now) => now.map((l) => (l.kind === kind ? { ...l, ...patch } : l)));
    setError(null);
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync({ defaultBoxCosts: lines.some((l) => l.amount !== null) ? lines : null, minEarningPerWm: floor && floor > 0 ? floor : null });
      message.success(`Money settings of "${service.name}" saved`);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onClose={save.isPending ? () => undefined : onClose}
      size="large"
      title="Money settings"
      subtitle={`What a new sailing of "${service.name}" starts with, and the least its shipments should earn.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="primary" loading={save.isPending} disabled={isLoading || isError} onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {isError && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            The money settings could not be read.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <span className={LABEL_TEXT}>Default box costs, per container</span>
          {lines.map((line) => (
            <div key={line.kind} className="grid grid-cols-[150px_140px_90px_1fr] items-center gap-2">
              <span className="text-[13px] text-slate-700">{BOX_COST_LABEL[line.kind]}</span>
              <InputNumber aria-label={`${BOX_COST_LABEL[line.kind]}: amount`} min={0} precision={2} controls={false} placeholder="Not set" value={line.amount} onChange={(amount) => set(line.kind, { amount })} className="!w-full" />
              <Select aria-label={`${BOX_COST_LABEL[line.kind]}: currency`} value={line.currency} onChange={(currency) => set(line.kind, { currency })} options={[...new Set([...BOX_COST_CURRENCIES, line.currency])].map((c) => ({ value: c, label: c }))} />
              <Input aria-label={`${BOX_COST_LABEL[line.kind]}: note`} maxLength={200} placeholder="Note (optional)" value={line.note} onChange={(e) => set(line.kind, { note: e.target.value })} />
            </div>
          ))}
          <span className={HINT}>
            A new sailing gets these on each of its containers, as estimates to correct on its Earnings tab. Leave the amounts empty for none. Sailings that exist keep their own costs.
          </span>
        </div>
        <label className="flex flex-col gap-1.5 border-t border-slate-100 pt-4">
          <span className={LABEL_TEXT}>Minimum earning per W/M (EUR)</span>
          <InputNumber aria-label="Minimum earning per W/M in EUR" min={0} precision={2} controls={false} placeholder="None" value={floor} onChange={setFloor} className="!w-[200px]" />
          <span className={HINT}>
            What a shipment should earn per W/M before the box is paid for: its selling less its inland delivery and other costs. A shipment below it is marked on the sailing&apos;s Earnings
            tab. It is a mark only: nothing is refused.
          </span>
        </label>
        {error && (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </AppModal>
  );
}
