"use client";

import { useEffect, useRef, useState } from "react";
import { Button, InputNumber, Modal, type GetRef } from "antd";
import type { CostLine } from "@/app/sales/_lib/types";
import { fmtMoney, moneyInputParser, round2 } from "@/lib/money";
import { lineRate, withRate } from "@/app/sales/_lib/salesQuote";

/** The selling line a buying line becomes with a markup in %: the same charge, quantity and basis, its rate marked up. */
export function sellingFromBuying(line: CostLine, markupPct: number): CostLine {
  return sellingAt(line, round2(lineRate(line) * (1 + markupPct / 100)));
}

// The selling line of a buying line at this rate (per W/M or container, or the whole line).
function sellingAt(line: CostLine, rate: number): CostLine {
  const selling: CostLine = {
    type: line.type,
    chargeCode: line.chargeCode,
    description: line.description,
    currency: line.currency,
    amount: rate,
    value: line.value ?? 1,
    ...(line.basis ? { basis: line.basis } : {}),
  };
  return withRate(selling, rate, line.value ?? 0);
}

interface AddToSellingDialogProps {
  // The buying line that just got its amount.
  line: CostLine;
  onAdd: (selling: CostLine) => void;
  onClose: () => void;
}

// Asked when a buying line gets its amount: whether the charge goes to selling as well, and with
// what markup - in %, or as a lump sum on top. The selling amount can be typed instead; each of
// the three follows the one typed. A line charged per W/M or per container is marked up per unit.
export function AddToSellingDialog({ line, onAdd, onClose }: AddToSellingDialogProps) {
  const buying = lineRate(line);
  const per = line.basis === "wm" ? " per W/M" : line.basis === "container" ? " per container" : "";
  const [markup, setMarkup] = useState<number | null>(null);
  const [lump, setLump] = useState<number | null>(null);
  const [selling, setSelling] = useState<number | null>(null);
  const name = (line.description ?? "").trim() || line.type;
  const markupInput = useRef<GetRef<typeof InputNumber>>(null);

  // The caret goes to the markup once the dialog is up - after the amount that opened it has
  // given the focus back to its own cell (the dialog does not take it by itself).
  useEffect(() => {
    const timer = setTimeout(() => markupInput.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  // The three from a selling amount; the one typed is kept as typed.
  const fromSelling = (amount: number | null) => {
    setSelling(amount);
    setLump(amount === null ? null : round2(amount - buying));
    setMarkup(amount === null || !buying ? null : round2((amount / buying - 1) * 100));
  };
  const changeMarkup = (pct: number | null) => {
    fromSelling(pct === null ? null : round2(buying * (1 + pct / 100)));
    setMarkup(pct);
  };
  const changeLump = (sum: number | null) => {
    fromSelling(sum === null ? null : round2(buying + sum));
    setLump(sum);
  };

  const add = () => {
    if (selling === null) return;
    onAdd(sellingAt(line, round2(selling)));
  };

  return (
    <Modal
      open
      title={`Add ${name} to selling as well?`}
      onCancel={onClose}
      width={420}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>No, buying only</Button>
          <Button type="primary" disabled={selling === null} onClick={add}>
            Add to selling
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <div className="text-sm text-slate-500">
          Buying: <span className="font-medium text-slate-800 tabular-nums">{fmtMoney(buying, line.currency)}</span>
          {per}
        </div>
        <label className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Markup</span>
          <InputNumber
            ref={markupInput}
            className="!w-full"
            aria-label="Markup %"
            suffix="%"
            precision={2}
            value={markup}
            onChange={changeMarkup}
            onPressEnter={add}
          />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-slate-500">or lump sum</span>
          <InputNumber
            className="!w-full"
            aria-label="Markup lump sum"
            prefix="+"
            suffix={line.currency}
            precision={2}
            parser={moneyInputParser}
            value={lump}
            onChange={changeLump}
            onPressEnter={add}
          />
        </label>
        <label className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Selling</span>
          <InputNumber
            className="!w-full"
            aria-label="Selling amount"
            suffix={line.currency}
            min={0}
            precision={2}
            parser={moneyInputParser}
            value={selling}
            onChange={fromSelling}
            onPressEnter={add}
          />
        </label>
      </div>
    </Modal>
  );
}
