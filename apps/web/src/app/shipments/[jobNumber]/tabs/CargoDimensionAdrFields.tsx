"use client";

import { Checkbox, Input, Select } from "antd";
import { ADR_PACKING_GROUPS, type CargoDimensionLine } from "@/lib/cargo";

interface CargoDimensionAdrFieldsProps {
  line: CargoDimensionLine;
  onPatch: (patch: Partial<CargoDimensionLine>) => void;
  // Saves the dimension lines; text boxes save when left, the pickers right away.
  onCommit: () => void;
}

// What the server takes as a UN number: four digits, "UN" in front allowed.
const UN_NUMBER = /^(UN\s*)?\d{4}$/i;

// The ADR (dangerous goods) details of one cargo dimension line, shown under it while its
// ADR box is ticked. The server checks UN number and packing group again and refuses others.
export function CargoDimensionAdrFields({ line, onPatch, onCommit }: CargoDimensionAdrFieldsProps) {
  const unNumber = line.adrUn ?? "";
  const commitSoon = () => setTimeout(onCommit, 0);

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-1.5 pl-3">
      <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">ADR</span>
      <Input
        size="small"
        className="!w-24"
        placeholder="UN number"
        aria-label="UN number"
        maxLength={7}
        status={unNumber && !UN_NUMBER.test(unNumber.trim()) ? "error" : undefined}
        value={unNumber}
        onChange={(e) => onPatch({ adrUn: e.target.value })}
        onBlur={onCommit}
      />
      <Input
        size="small"
        className="!w-20"
        placeholder="Class"
        aria-label="ADR class"
        maxLength={8}
        value={line.adrClass ?? ""}
        onChange={(e) => onPatch({ adrClass: e.target.value })}
        onBlur={onCommit}
      />
      <Select
        size="small"
        className="!w-24"
        placeholder="Packing gr."
        aria-label="Packing group"
        allowClear
        value={line.adrPackingGroup ?? undefined}
        options={ADR_PACKING_GROUPS.map((g) => ({ value: g, label: `PG ${g}` }))}
        onChange={(v) => {
          onPatch({ adrPackingGroup: v ?? null });
          commitSoon();
        }}
      />
      <Checkbox
        className="text-xs"
        checked={line.adrLimitedQuantity ?? false}
        onChange={(e) => {
          onPatch({ adrLimitedQuantity: e.target.checked });
          commitSoon();
        }}
      >
        Limited quantity
      </Checkbox>
    </div>
  );
}
