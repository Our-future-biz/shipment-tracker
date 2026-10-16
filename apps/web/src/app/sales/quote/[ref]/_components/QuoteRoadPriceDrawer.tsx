"use client";

import { useState } from "react";
import { Alert, Button, Drawer, Spin } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, businessDateTime } from "@/lib/date";
import { useRateQuery, useTruckingSettings } from "@/hooks/useTrucking";
import { RateResultsTable } from "@/app/trucking/_components/RateResultsTable";
import { toRateRequest } from "@/app/trucking/_lib/rateCalculator";
import { RoadPricePicker } from "../../../_components/RoadPricePicker";
import { defaultPick, roadToRateForm, type RatePick } from "../../../_lib/roadQuote";
import type { QuoteRoadInput } from "../../../_lib/types";

interface QuoteRoadPriceDrawerProps {
  open: boolean;
  road: QuoteRoadInput;
  // The quote's customer: its own sell tariff, else the Standard list.
  customerId: string | null;
  // The level the quote was priced with last, offered first again.
  previousLevel: string | null;
  // Puts the pick on the quote. Resolves with why the server refused, or null.
  onConfirm: (pick: RatePick) => Promise<string | null>;
  onClose: () => void;
}

// "Price from tariff": every active service level for the quote's road input and customer, as the
// rate calculator shows them; the user picks a level and a haulier and puts them on the quote.
export const QuoteRoadPriceDrawer = ({ open, road, customerId, previousLevel, onConfirm, onClose }: QuoteRoadPriceDrawerProps) => {
  const { settings } = useTruckingSettings();
  // The user's own pick; until they choose, the level offered first (the one priced last).
  const [chosen, setChosen] = useState<RatePick | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Each opening rates the road as it is now (a new round), and forgets the last opening's pick.
  const [round, setRound] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRound((r) => r + 1);
      setChosen(undefined);
      setRefusal(null);
    }
  }
  const request = open ? toRateRequest(roadToRateForm(road, businessToday(), customerId)) : null;
  const { result, isRating, error } = useRateQuery(request, round);
  const pick = chosen !== undefined ? chosen : result ? defaultPick(result.results, previousLevel) : null;
  const setPick = (p: RatePick | null) => setChosen(p);

  const handleConfirm = async () => {
    if (!pick) return;
    setSaving(true);
    setRefusal(null);
    const refused = await onConfirm(pick);
    setSaving(false);
    if (refused) setRefusal(refused);
  };

  return (
    <Drawer
      open={open}
      onClose={saving ? undefined : onClose}
      maskClosable={!saving}
      width={960}
      destroyOnHidden
      title="Price from tariff"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">Replaces the lines priced from a tariff; lines typed by hand stay.</span>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleConfirm} loading={saving} disabled={!pick || isRating}>
            Put on quote
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {isRating && (
          <div className="flex justify-center p-10">
            <Spin />
          </div>
        )}
        {error && <Alert type="error" showIcon message={`Could not price it — ${apiErrorMessage(error)}.`} />}
        {result && (
          <>
            <div className="text-[12px] text-slate-500">
              Rated {businessDateTime(result.ratedAt)} for {customerId ? "the quote's customer (their own tariff, else the Standard list)" : "the Standard list"} · click a row
              for the price lines and every haulier
            </div>
            <div className="rounded-xl border border-slate-200 bg-white">
              <RateResultsTable results={result.results} includeBuy includeInternal={false} marginFloor={settings?.marginFloor ?? null} />
            </div>
            <RoadPricePicker results={result.results} value={pick} onChange={setPick} disabled={saving} />
            {!pick && <Alert type="warning" showIcon message="No service level has a sell price for this road — check the postcodes and quantities." />}
          </>
        )}
        {refusal && <Alert type="error" showIcon message={refusal} />}
      </div>
    </Drawer>
  );
};
