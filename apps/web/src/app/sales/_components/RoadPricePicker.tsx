"use client";

import { Select } from "antd";
import { useHauliers, type RateLevelResult } from "@/hooks/useTrucking";
import { HaulierOptionLabel } from "@/app/trucking/_components/HaulierOptionLabel";
import { HaulierRatingNote } from "@/app/trucking/_components/HaulierRatingNote";
import { notInUseOf, ratingsOf, reasonsOf } from "@/app/trucking/_lib/haulierRating";
import { promisedLabel } from "@/app/trucking/_lib/rateCalculator";
import { isPriced } from "@/app/trucking/_lib/tariffs";
import { formatAmount as formatMoney } from "@/lib/money";
import { TruckingField } from "@/app/trucking/_components/TruckingField";
import { SUPPLIER_NOT_IN_USE } from "@/app/customers/_lib/supplierStatus";
import { defaultHaulier, pickableLevels, type RatePick } from "../_lib/roadQuote";

interface RoadPricePickerProps {
  results: readonly RateLevelResult[];
  value: RatePick | null;
  onChange: (pick: RatePick) => void;
  disabled?: boolean;
}

// Which service level and haulier go on the quote: only levels with a sell price are offered, and
// a level's hauliers in the engine's order (preferred lane first, then cheapest), each with its stars, and
// "Not in use" after one the Customer Database set so (D16). The order is the price's, not the rating's:
// the first is the one the margin is worked out from.
export const RoadPricePicker = ({ results, value, onChange, disabled = false }: RoadPricePickerProps) => {
  const levels = pickableLevels(results);
  const { hauliers } = useHauliers();
  const ratings = ratingsOf(hauliers);
  const reasons = reasonsOf(hauliers);
  const notInUse = notInUseOf(hauliers);
  const chosen = value?.haulierCustomerId ?? null;
  const level = levels.find((r) => r.serviceLevel === value?.serviceLevel);

  const levelOptions = levels.map((r) => ({
    value: r.serviceLevel,
    label: `${r.label} · ${isPriced(r.sell) ? formatMoney(r.sell.total, r.sell.currency) : ""} · ${promisedLabel(r)}`,
  }));
  const haulierOptions = (level?.buy ?? []).map((b, i) => ({
    value: b.ownerCustomerId ?? "",
    label: `${b.ownerName ?? "Haulier"}${b.ownerCustomerId && notInUse.has(b.ownerCustomerId) ? ` · ${SUPPLIER_NOT_IN_USE}` : ""} · ${formatMoney(b.total, b.currency)}${b.preferred ? " · preferred lane" : ""}${i === 0 ? " · suggested" : ""}`,
    rating: b.ownerCustomerId && ratings.has(b.ownerCustomerId) ? (ratings.get(b.ownerCustomerId) ?? null) : undefined,
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
          optionRender={(o) => <HaulierOptionLabel label={o.label} rating={o.data.rating} />}
          onChange={(haulierCustomerId: string) => value && onChange({ ...value, haulierCustomerId })}
        />
        {/* The chosen (or suggested) haulier's rating, as a warning only: the quote line says it too (m22). */}
        <HaulierRatingNote customerId={chosen} rating={chosen ? ratings.get(chosen) : undefined} reason={chosen ? reasons.get(chosen) : ""} />
      </TruckingField>
    </div>
  );
};
