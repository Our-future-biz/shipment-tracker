"use client";

import { useRef, useState } from "react";
import { Alert, App, DatePicker, Input, InputNumber, Modal } from "antd";
import dayjs from "dayjs";
import { useSetRoe } from "@/hooks/useFx";
import { useToast } from "@/lib/toast";
import { fmtPct, fmtRate, type FxOverview } from "./fxShared";

interface Props {
  current: number;
  rates: FxOverview["rates"];
  today: string;
  onClose: () => void;
}

export function RoeDialog({ current, rates, today, onClose }: Props) {
  const toast = useToast();
  const { modal } = App.useApp();
  const setRoe = useSetRoe();
  // One back-dated confirm at a time, however often Save is clicked.
  const confirming = useRef(false);
  const [pct, setPct] = useState<number | null>(current);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const backdated = effectiveFrom < today;

  const save = () =>
    setRoe.mutate(
      { pct: pct ?? 0, effectiveFrom, note: note.trim() },
      {
        onSuccess: () => {
          toast.success("ROE % saved");
          onClose();
        },
        onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not save"),
      },
    );

  const handleSubmit = () => {
    if (confirming.current || setRoe.isPending) return;
    setError("");
    if (pct == null || pct < 80 || pct > 120) return setError("Enter a % between 80 and 120.");
    if (!note.trim()) return setError("Add a note saying why the % changes.");
    if (backdated) {
      confirming.current = true;
      modal.confirm({
        title: "Back-dated change",
        content: `The new % will count from ${dayjs(effectiveFrom).format("DD.MM.YYYY")}, a date in the past. Quotes and invoices already made keep their rates.`,
        okText: "Save anyway",
        onOk: save,
        afterClose: () => {
          confirming.current = false;
        },
      });
      return;
    }
    save();
  };

  return (
    <Modal
      open
      title="Change the company ROE %"
      okText="Save"
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={setRoe.isPending}
      destroyOnHidden
    >
      <div className="flex flex-col gap-4 pt-2">
        <Alert
          type="info"
          showIcon
          message="Applies to new quotes and draft lines priced in another currency. Sent quotes, issued invoices and closed jobs keep their rates. Profit, VAT and reports always use the pure ČNB rate."
        />
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-slate-600">
            ROE %
            <InputNumber
              value={pct}
              onChange={(v) => setPct(v)}
              min={80}
              max={120}
              step={0.5}
              precision={3}
              decimalSeparator="."
              suffix="%"
              className="!w-full"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-slate-600">
            Effective from
            <DatePicker
              value={dayjs(effectiveFrom)}
              onChange={(d) => d && setEffectiveFrom(d.format("YYYY-MM-DD"))}
              format="DD.MM.YYYY"
              allowClear={false}
              className="!w-full"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-slate-600">
          Note (why it changes)
          <Input.TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder="e.g. USD volatility, agreed with finance" />
        </label>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[13px]">
          <div className="font-semibold text-slate-600 mb-1">Preview at {fmtPct(pct ?? 100)}</div>
          {rates.map((r) => (
            <div key={r.currency} className="flex justify-between tabular-nums">
              <span>{r.currency}</span>
              <span>
                ČNB {fmtRate(r.rate)} → pricing {fmtRate(r.rate == null ? null : (r.rate * (pct ?? 100)) / 100)}
              </span>
            </div>
          ))}
        </div>
        {backdated && <div className="text-[12.5px] text-warn">This date is in the past — you will be asked to confirm.</div>}
        {error && <div className="text-[13px] text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}
