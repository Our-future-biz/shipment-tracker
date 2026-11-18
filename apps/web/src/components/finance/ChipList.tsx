"use client";

import { Tooltip } from "antd";
import { Pill, type PillTone } from "@/components/Pill";
import { EMPTY } from "@/styles/ui";

// A wrapping list of tone pills with tooltips, for the marks beside a Finance invoice's status (Accounts Payable,
// Accounts Receivable); "—" when there is none, unless `empty` is false.

export interface ChipItem {
  label: string;
  tone: PillTone;
  /** The tooltip */
  title?: string;
  /** The React key; the label when not given */
  key?: string;
}

export function ChipList({ chips, empty = true }: { chips: readonly ChipItem[]; empty?: boolean }) {
  if (!chips.length) return empty ? <span className={EMPTY}>—</span> : null;
  return (
    <div className="flex flex-wrap gap-1 max-w-[300px]">
      {chips.map((c) => (
        <Tooltip key={c.key ?? c.label} title={c.title}>
          <Pill tone={c.tone}>{c.label}</Pill>
        </Tooltip>
      ))}
    </div>
  );
}
