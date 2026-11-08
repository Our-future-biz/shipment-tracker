"use client";

import { Select } from "antd";
import { CURRENCIES } from "@/lib/cargo";

interface CurrencyPickerProps {
  value: string;
  onChange: (v: string) => void;
  /** A locked row: the code reads as text, as the row's other fields (a double-click opens the row). */
  locked?: boolean;
  ariaLabel?: string;
}

const OPTIONS = CURRENCIES.map(({ code, name }) => ({ value: code, title: name, label: `${code} — ${name}` }));

/**
 * Currency picker of a cost row (a shipment's Costs Breakdown, a master job's Buying costs), searching
 * by code and name.
 */
export function CurrencyPicker({ value, onChange, locked = false, ariaLabel }: CurrencyPickerProps) {
  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      showSearch
      placeholder="CUR"
      aria-label={ariaLabel}
      // matches the code or the name
      filterOption={(input, option) => {
        const q = (input || "").toLowerCase().trim();
        if (!q) return true;
        const code = String(option?.value ?? "").toLowerCase();
        const name = String(option?.title ?? "").toLowerCase();
        return code.includes(q) || name.includes(q);
      }}
      options={OPTIONS}
      // the open list shows the name too, the cell only the code
      optionRender={(opt) => (
        <span className="text-[13px]">
          <span className="font-semibold">{String(opt.value)}</span>
          <span className="text-slate-400"> — {String(opt.data?.title ?? "")}</span>
        </span>
      )}
      labelRender={(p) => <span className="text-[13px]">{String(p.value ?? "")}</span>}
      popupMatchSelectWidth={false}
      className={`w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border
                 [&_.ant-select-selector]:!border-slate-300 [&_.ant-select-selector]:!rounded-md
                 [&_.ant-select-selection-item]:!text-[13px] [&_.ant-select-selection-search-input]:!text-[13px]${
        locked ? " [&_.ant-select-selector]:!border-transparent [&_.ant-select-selector]:!bg-transparent [&_.ant-select-arrow]:!hidden pointer-events-none" : ""
      }`}
      tabIndex={locked ? -1 : undefined}
    />
  );
}
