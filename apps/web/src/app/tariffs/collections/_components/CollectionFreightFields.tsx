"use client";

import { Checkbox } from "antd";
import type { CollectionFreightMode } from "@/hooks/useCollectionTariffs";
import { COLLECTION_FREIGHT_MODES } from "../../_lib/collectionTariffs";

const FREIGHT_CHIP = "inline-block rounded-full border px-2 py-0.5 text-[11.5px] font-medium bg-indigo-50 text-indigo-700 border-indigo-200";

interface CollectionFreightFieldsProps {
  value: CollectionFreightMode[];
  onChange: (value: CollectionFreightMode[]) => void;
  disabled?: boolean;
}

// What a collections tariff collects and delivers: Sea LCL, Air or both.
export const CollectionFreightFields = ({ value, onChange, disabled }: CollectionFreightFieldsProps) => (
  <fieldset className="m-0 p-0 border-0 text-[13px]">
    <legend className="text-[12px] font-semibold text-slate-600 mb-1.5 p-0">Used for</legend>
    <Checkbox.Group aria-label="Used for" options={COLLECTION_FREIGHT_MODES} value={value} disabled={disabled} onChange={onChange} className="!flex gap-4" />
  </fieldset>
);

/** The freight a tariff serves, as chips. */
export const FreightChips = ({ modes }: { modes: readonly CollectionFreightMode[] }) => (
  <>
    {COLLECTION_FREIGHT_MODES.filter((m) => modes.includes(m.value)).map((m) => (
      <span key={m.value} className={FREIGHT_CHIP}>
        {m.label}
      </span>
    ))}
  </>
);
