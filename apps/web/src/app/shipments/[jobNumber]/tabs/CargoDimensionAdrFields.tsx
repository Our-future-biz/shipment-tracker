"use client";

import { Checkbox, Input, Select } from "antd";
import { ADR_PACKING_GROUPS, type CargoDimensionLine } from "@/lib/cargo";

// The ADR fields alone: a shipment's cargo line has them, and so has a quote's dangerous goods.
type AdrDetails = Pick<CargoDimensionLine, "adrUn" | "adrClass" | "adrPackingGroup" | "adrLimitedQuantity">;

interface CargoDimensionAdrFieldsProps {
  line: AdrDetails;
  onPatch: (patch: Partial<AdrDetails>) => void;
  // Saves the dimension lines; text boxes save when left, the pickers right away.
  onCommit: () => void;
}

// What the server takes as a UN number: four digits, "UN" in front allowed.
const UN_NUMBER = /^(UN\s*)?\d{4}$/i;

// Every label in the strip reads like "Limited quantity": plain 13px, dark amber (a warning).
const LABEL = "text-[13px] text-amber-800";

// The ADR (dangerous goods) details of one cargo dimension line, shown under it while its
// ADR box is ticked: a soft amber strip, each field with a small label. The server checks UN
// number and packing group again and refuses others.
export function CargoDimensionAdrFields({ line, onPatch, onCommit }: CargoDimensionAdrFieldsProps) {
  const unNumber = line.adrUn ?? "";
  const commitSoon = () => setTimeout(onCommit, 0);

  return (
    <div className="mx-1 mt-0.5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-amber-50/70 ring-1 ring-inset ring-amber-100 px-3 py-1.5">
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
        className="!text-amber-800"
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
