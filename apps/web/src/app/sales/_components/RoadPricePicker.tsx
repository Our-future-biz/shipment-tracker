"use client";

import { Select } from "antd";
import type { RateLevelResult } from "@/hooks/useTrucking";
import { promisedLabel } from "@/app/trucking/_lib/rateCalculator";
import { formatMoney, isPriced } from "@/app/trucking/_lib/tariffs";
import { TruckingField } from "@/app/trucking/_components/TruckingField";
import { defaultHaulier, pickableLevels, type RatePick } from "../_lib/roadQuote";

interface RoadPricePickerProps {
  results: readonly RateLevelResult[];
  value: RatePick | null;
  onChange: (pick: RatePick) => void;
  disabled?: boolean;
}

// Which service level and haulier go on the quote: only levels with a sell price are offered, and
// a level's hauliers in the engine's order (preferred lane first, then cheapest).
export const RoadPricePicker = ({ results, value, onChange, disabled = false }: RoadPricePickerProps) => {
  const levels = pickableLevels(results);
  const level = levels.find((r) => r.serviceLevel === value?.serviceLevel);

  const levelOptions = levels.map((r) => ({
    value: r.serviceLevel,
    label: `${r.label} · ${isPriced(r.sell) ? formatMoney(r.sell.total, r.sell.currency) : ""} · ${promisedLabel(r)}`,
  }));
  const haulierOptions = (level?.buy ?? []).map((b, i) => ({
    value: b.ownerCustomerId ?? "",
    label: `${b.ownerName ?? "Haulier"} · ${formatMoney(b.total, b.currency)}${b.preferred ? " · preferred lane" : ""}${i === 0 ? " · best" : ""}`,
  }));

  const handleLevelChange = (serviceLevel: RateLevelResult["serviceLevel"]) =>
    onChange({ serviceLevel, haulierCustomerId: defaultHaulier(levels.find((r) => r.serviceLevel === serviceLevel)) });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <TruckingField label="Service level">
        <Select
          aria-label="Service level"
          placeholder={levels.length ? "Choose the service level" : "No level has a sell price"}
          disabled={disabled || !levels.length}
          value={value?.serviceLevel}
          options={levelOptions}
          onChange={handleLevelChange}
        />
      </TruckingField>
      <TruckingField label="Haulier" hint={level && !level.buy.length ? "No haulier covers this lane — the quote gets no buying lines" : undefined}>
        <Select
          aria-label="Haulier"
          placeholder={level && !level.buy.length ? "No haulier" : "Choose the haulier"}
          disabled={disabled || !level?.buy.length}
          value={value?.haulierCustomerId ?? undefined}
          options={haulierOptions}
          onChange={(haulierCustomerId: string) => value && onChange({ ...value, haulierCustomerId })}
        />
      </TruckingField>
    </div>
  );
};
