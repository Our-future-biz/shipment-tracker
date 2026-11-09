"use client";

import { Button } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { fmtMoney, roundCents } from "@/lib/money";
import type { FclBlock, FclBlockPrice } from "@/app/sales/_lib/fclPricing";
import { HINT, LABEL_TEXT } from "@/styles/ui";

interface FclProfitRowProps {
  block: FclBlock;
  priced: FclBlockPrice;
  currency: string;
  closed: boolean;
  onEditPerCharge: () => void;
}

// Where the block's profit is set - charge by charge - and what it makes: profit, total buying,
// total selling (per container in a container block, and for all its containers beside).
export function FclProfitRow({ block, priced, currency, closed, onEditPerCharge }: FclProfitRowProps) {
  const per = block.perContainer ? " / ctr" : "";
  const many = block.perContainer && block.units > 1;
  const times = (amount: number) => fmtMoney(roundCents(amount * block.units), currency);
  const figure = (label: string, amount: number, strong = false) => (
    <div className="flex flex-col items-end min-w-[120px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white">
      <span className={LABEL_TEXT}>
        {label}
        {per}
      </span>
      <span className={`tabular-nums ${strong ? "text-[14px] font-bold text-slate-900" : "text-[13px] font-semibold text-slate-700"}`}>{fmtMoney(amount, currency)}</span>
      {many && <span className="text-[11px] text-slate-400 tabular-nums">× {block.units} = {times(amount)}</span>}
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 border-t border-slate-200 bg-slate-50/60">
      <div className="flex flex-wrap items-center gap-2">
        <span className={LABEL_TEXT}>Profit</span>
        <Button size="small" type="link" icon={<EditOutlined />} disabled={closed || priced.charges.length === 0} onClick={onEditPerCharge}>
          Edit per charge
        </Button>
        <div className="ml-auto flex flex-wrap items-stretch gap-2">
          {figure(priced.percent === null ? "Profit" : `Profit · ${priced.percent} %`, priced.profit)}
          {figure("Total buying", priced.buying)}
          {figure("Total selling", priced.selling, true)}
        </div>
      </div>
      {priced.roe !== 0 && (
        <span className={HINT}>
          Total selling includes {fmtMoney(priced.roe, currency)}{per} of ROE (the FX buffer) on the charges in another currency than {currency}, as the quotation and the totals do.
        </span>
      )}
    </div>
  );
}
