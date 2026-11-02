"use client";

import { Button, InputNumber, Select } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { fmtMoney, moneyInputParser, roundCents } from "@/lib/money";
import { MAX_PROFIT_PERCENT, type FclBlock, type FclBlockPrice } from "@/app/sales/_lib/fclPricing";
import type { FclBlockProfit, FclProfit } from "@/app/sales/_lib/types";
import { FCL_NOTE_CLASS, FCL_PROFIT_MODES } from "../_lib/fclPricingUi";

interface FclProfitRowProps {
  block: FclBlock;
  priced: FclBlockPrice;
  setting: FclBlockProfit;
  currency: string;
  closed: boolean;
  onSetting: (patch: Partial<FclBlockProfit>) => void;
  onEditPerCharge: () => void;
}

// The block's profit - % or SUM, then the figure - and what it makes: profit, total buying, total
// selling (per container in a container block, and for all its containers beside).
export function FclProfitRow({ block, priced, setting, currency, closed, onSetting, onEditPerCharge }: FclProfitRowProps) {
  const per = block.perContainer ? " / ctr" : "";
  const many = block.perContainer && block.units > 1;
  const times = (amount: number) => fmtMoney(roundCents(amount * block.units), currency);
  const figure = (label: string, amount: number, strong = false) => (
    <div className="flex flex-col items-end min-w-[120px] px-3 py-1.5 rounded-md border border-slate-200 bg-white">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
        {label}
        {per}
      </span>
      <span className={`tabular-nums ${strong ? "text-[14px] font-bold text-slate-900" : "text-[13px] font-semibold text-slate-700"}`}>{fmtMoney(amount, currency)}</span>
      {many && <span className="text-[10.5px] text-slate-400 tabular-nums">× {block.units} = {times(amount)}</span>}
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 border-t border-slate-200 bg-slate-50/60">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Profit</span>
        {setting.perCharge ? (
          <span className="text-[12px] text-slate-600">Set per charge</span>
        ) : (
          <>
            <Select
              size="small"
              className="w-[76px]"
              aria-label="Profit as"
              value={setting.mode}
              options={FCL_PROFIT_MODES}
              onChange={(mode: FclProfit["mode"]) => onSetting({ mode, value: 0 })}
            />
            <InputNumber
              size="small"
              className="!w-[120px]"
              aria-label={setting.mode === "percent" ? "Profit %" : `Profit ${currency}${per}`}
              min={setting.mode === "percent" ? 0 : undefined}
              max={setting.mode === "percent" ? MAX_PROFIT_PERCENT : undefined}
              // % profit is a whole number.
              precision={setting.mode === "percent" ? 0 : 2}
              parser={moneyInputParser}
              addonAfter={setting.mode === "percent" ? "%" : currency}
              value={setting.value}
              onChange={(v) => onSetting({ value: Number(v) || 0 })}
            />
          </>
        )}
        <Button size="small" type="link" icon={<EditOutlined />} disabled={closed || priced.charges.every((c) => !c.takesProfit)} onClick={onEditPerCharge}>
          Edit per charge
        </Button>
        <div className="ml-auto flex flex-wrap items-stretch gap-2">
          {figure(priced.percent === null ? "Profit" : `Profit · ${priced.percent} %`, priced.profit)}
          {figure("Total buying", priced.buying)}
          {figure("Total selling", priced.selling, true)}
        </div>
      </div>
      {priced.profitUnplaced && <span className={FCL_NOTE_CLASS}>No charge in this block takes profit: tick the profit basis of one, or put one in the all-in price.</span>}
    </div>
  );
}
