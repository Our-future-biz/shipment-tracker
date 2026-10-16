"use client";

import { Select } from "antd";
import { CalculatorOutlined } from "@ant-design/icons";
import { useCustomerSites, type CustomerSiteItem } from "@/hooks/useCustomerSites";
import { businessToday, businessDateTime } from "@/lib/date";
import { siteAddressLine } from "@/app/customers/_lib/customerSites";
import { RateCalculatorForm } from "@/app/trucking/_components/RateCalculatorForm";
import { TruckingField } from "@/app/trucking/_components/TruckingField";
import { formatPostcode as formatPsc } from "@/lib/postcode";
import { promisedLabel, type RateForm } from "@/app/trucking/_lib/rateCalculator";
import { formatAmount as formatMoney } from "@/lib/money";
import { rateFormToRoad, roadToRateForm } from "../../../_lib/roadQuote";
import type { QuoteRoadInput, QuoteRoadPricing } from "../../../_lib/types";
import { LineBlock } from "./LineBlock";
import { MiniButton } from "./QuoteButtons";

interface QuoteRoadCardProps {
  road: QuoteRoadInput;
  // The customer whose sites are offered as pick-up and delivery addresses.
  customerId: string | undefined;
  // What "Price from tariff" wrote last.
  pricing: QuoteRoadPricing | undefined;
  // Why the road cannot be priced yet; the button waits until there is nothing.
  problems: string[];
  onChange: (road: QuoteRoadInput) => void;
  onPrice: () => void;
}

// A site in the picker: its label and address, so two sites of one customer can be told apart.
const siteOption = (site: CustomerSiteItem) => ({ value: site.id, label: `${site.label || "Site"} · ${siteAddressLine(site)}` });

// The postcode a site fills in: a Czech one the Czech way, any other as stored.
const sitePostcode = (site: CustomerSiteItem) => (site.country === "CZ" ? formatPsc(site.postcode) : site.postcode);

// The road transport of a quote: where from and to (a site of the customer or a typed postcode),
// when, what is carried and the extras - the rate calculator's own form. "Price from tariff" puts
// the tariff's lines on the quote; what that wrote last stands at the foot.
export const QuoteRoadCard = ({ road, customerId, pricing, problems, onChange, onPrice }: QuoteRoadCardProps) => {
  const { sites } = useCustomerSites(customerId ?? "");
  const today = businessToday();
  const siteOptions = customerId ? sites.map(siteOption) : [];

  // The form shows today for a road without a date; picking today keeps "no date" (priced on the day).
  const form = roadToRateForm(road, today, null);
  const handleFormChange = (next: RateForm) => {
    const typed = rateFormToRoad(next);
    // A postcode typed over the site's leaves the site; an untouched one stays as it was.
    const fromChanged = next.fromPsc !== form.fromPsc;
    const toChanged = next.toPsc !== form.toPsc;
    onChange({
      ...typed,
      pickupDate: road.pickupDate === null && typed.pickupDate === today ? null : typed.pickupDate,
      fromSiteId: fromChanged ? null : road.fromSiteId,
      fromPostcode: fromChanged ? typed.fromPostcode : road.fromPostcode,
      toSiteId: toChanged ? null : road.toSiteId,
      toPostcode: toChanged ? typed.toPostcode : road.toPostcode,
    });
  };

  const pickSite = (end: "from" | "to", siteId: string | undefined) => {
    const site = sites.find((s) => s.id === siteId);
    if (end === "from") onChange({ ...road, fromSiteId: site?.id ?? null, fromPostcode: site ? sitePostcode(site) : road.fromPostcode });
    else onChange({ ...road, toSiteId: site?.id ?? null, toPostcode: site ? sitePostcode(site) : road.toPostcode });
  };

  const siteSelect = (end: "from" | "to") => (
    <Select
      allowClear
      size="small"
      aria-label={end === "from" ? "Pick-up site" : "Delivery site"}
      placeholder={customerId ? (siteOptions.length ? "Choose a site or type the postcode below" : "The customer has no sites") : "Link a customer to pick its sites"}
      disabled={!siteOptions.length}
      value={(end === "from" ? road.fromSiteId : road.toSiteId) ?? undefined}
      options={siteOptions}
      onChange={(id?: string) => pickSite(end, id)}
    />
  );

  return (
    <LineBlock
      title="Road transport"
      actions={
        <MiniButton icon={<CalculatorOutlined />} disabled={problems.length > 0} title={problems.join(" · ") || undefined} onClick={onPrice}>
          Price from tariff
        </MiniButton>
      }
    >
      <div className="flex flex-col gap-4 p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TruckingField label="Pick-up site">{siteSelect("from")}</TruckingField>
          <TruckingField label="Delivery site">{siteSelect("to")}</TruckingField>
        </div>
        <RateCalculatorForm form={form} onChange={handleFormChange} />
        {problems.length > 0 && <div className="text-xs text-slate-500">To price it: {problems.join(" · ")}</div>}
        {pricing && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[12.5px] text-slate-700">
            <div>
              <span className="font-semibold">Priced from tariff:</span> {pricing.serviceLabel} · sell {pricing.sell.tariffName} v{pricing.sell.versionNo},{" "}
              {formatMoney(pricing.sell.total, pricing.sell.currency)}
              {pricing.buy
                ? ` · buy ${pricing.buy.haulierName} v${pricing.buy.versionNo}, ${formatMoney(pricing.buy.total, pricing.buy.currency)}`
                : " · no haulier"}
            </div>
            <div>
              <span className="font-semibold">Promised delivery:</span> {promisedLabel(pricing)}
              {pricing.promiseNote && <span className="text-slate-500"> — {pricing.promiseNote}</span>}
            </div>
            <div className="text-[11.5px] text-slate-500">Rated {businessDateTime(pricing.ratedAt)}</div>
          </div>
        )}
      </div>
    </LineBlock>
  );
};
