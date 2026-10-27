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
// ADR box is ticked: a soft orange strip, each field with a small label. The server checks UN
// number and packing group again and refuses others.
// Every label in the strip reads like "Limited quantity": plain 13px, dark orange.
const LABEL = "text-[13px] text-orange-800";
export function CargoDimensionAdrFields({ line, onPatch, onCommit }: CargoDimensionAdrFieldsProps) {
  const unNumber = line.adrUn ?? "";
  const commitSoon = () => setTimeout(onCommit, 0);

  return (
    <div className="mx-1 mt-0.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-orange-50/70 ring-1 ring-inset ring-orange-100 px-3 py-1.5">
      <label className="flex items-center gap-1.5">
        <span className={LABEL}>UN number</span>
      <Input
        size="small"
        className="!w-24"
        placeholder="1203"
        aria-label="UN number"
        maxLength={7}
        status={unNumber && !UN_NUMBER.test(unNumber.trim()) ? "error" : undefined}
        value={unNumber}
        onChange={(e) => onPatch({ adrUn: e.target.value })}
        onBlur={onCommit}
      />
      </label>
      <label className="flex items-center gap-1.5">
        <span className={LABEL}>Class</span>
      <Input
        size="small"
        className="!w-20"
        placeholder="3"
        aria-label="ADR class"
        maxLength={8}
        value={line.adrClass ?? ""}
        onChange={(e) => onPatch({ adrClass: e.target.value })}
        onBlur={onCommit}
      />
      </label>
      <label className="flex items-center gap-1.5">
        <span className={LABEL}>Packing group</span>
      <Select
        size="small"
        className="!w-24"
        placeholder="—"
        aria-label="Packing group"
        allowClear
        value={line.adrPackingGroup ?? undefined}
        options={ADR_PACKING_GROUPS.map((g) => ({ value: g, label: `PG ${g}` }))}
        onChange={(v) => {
          onPatch({ adrPackingGroup: v ?? null });
          commitSoon();
        }}
      />
      </label>
      <Checkbox
        className="!text-[13px] !text-orange-800"
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
