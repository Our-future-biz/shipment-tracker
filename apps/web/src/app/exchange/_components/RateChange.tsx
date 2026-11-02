"use client";

import { Tooltip } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { formatDate } from "@/lib/date";

// The move since the previous fixing, per the units ČNB quotes (`amount`: 1, 100, 1000).
export function RateChange({
  rate, previous, previousDate, amount = 1,
}: { rate: number | null; previous: number | null; previousDate: string | null; amount?: number }) {
  if (rate == null || previous == null) return null;
  const diff = (rate - previous) * amount;
  if (Math.abs(diff) < 0.0005) return <span className="text-[12px] text-slate-400">unchanged</span>;
  // Neutral colour: a stronger or weaker koruna is neither good nor bad in itself.
  const up = diff > 0;
  return (
    <Tooltip title={`vs ${formatDate(previousDate)}`}>
    <span className="text-[12px] font-semibold text-slate-500">
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(diff).toFixed(3)}
    </span>
    </Tooltip>
  );
}
