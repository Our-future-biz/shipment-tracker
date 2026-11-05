"use client";

import { Checkbox } from "antd";
import { Badge } from "@/components/Badge";
import type { CollectionFreightMode } from "@/hooks/useCollectionTariffs";
import { LABEL_TEXT } from "@/styles/ui";
import { COLLECTION_FREIGHT_MODES } from "../../_lib/collectionTariffs";

interface CollectionFreightFieldsProps {
  value: CollectionFreightMode[];
  onChange: (value: CollectionFreightMode[]) => void;
  disabled?: boolean;
}

// What a collections tariff collects and delivers: Sea LCL, Air or both.
export const CollectionFreightFields = ({ value, onChange, disabled }: CollectionFreightFieldsProps) => (
  <fieldset className="m-0 p-0 border-0 text-[13px]">
    <legend className={`${LABEL_TEXT} mb-1.5 p-0`}>Used for</legend>
    <Checkbox.Group aria-label="Used for" options={COLLECTION_FREIGHT_MODES} value={value} disabled={disabled} onChange={onChange} className="!flex gap-4" />
  </fieldset>
);

/** The freight a tariff serves, as chips. */
export const FreightChips = ({ modes }: { modes: readonly CollectionFreightMode[] }) => (
  <>
    {COLLECTION_FREIGHT_MODES.filter((m) => modes.includes(m.value)).map((m) => (
      <Badge key={m.value} tone="i">
        {m.label}
      </Badge>
    ))}
  </>
);
