import { Select } from "antd";
import { offerTerminals } from "../../../_lib/tariffQuote";

interface TariffViaFilterProps {
  /** "Terminal", "Transshipment" */
  label: string;
  placeholder: string;
  /** How an offer that runs via no terminal is named: "—", "Direct" */
  noneLabel: string;
  offers: readonly { via: string }[];
  /** The terminals chosen; one the offers do not run via is kept but not shown */
  chosen: string[];
  onChange: (chosen: string[]) => void;
}

// The terminals (or transshipment ports) the offers of a "Tariffs available" drawer can be narrowed
// to, each with how many offers run via it; none chosen shows them all.
export const TariffViaFilter = ({ label, placeholder, noneLabel, offers, chosen, onChange }: TariffViaFilterProps) => {
  const options = offerTerminals(offers).map((t) => ({ value: t.via, label: `${t.via || noneLabel} (${t.count})` }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-semibold text-slate-600">{label}</span>
      <Select
        mode="multiple"
        allowClear
        aria-label={label}
        placeholder={placeholder}
        value={chosen.filter((v) => options.some((o) => o.value === v))}
        options={options}
        onChange={onChange}
        className="min-w-[260px] max-w-full"
      />
    </div>
  );
};
