"use client";

import Link from "next/link";
import { Button, Tabs, Tooltip } from "antd";
import { QuestionCircleOutlined, SettingOutlined } from "@ant-design/icons";
import { TRUCKING_TABS, type TruckingTab } from "../_lib/tabs";

interface TruckingTabsProps {
  active: TruckingTab;
  /** Count pill per tab; a tab without a count shows none. */
  counts: Partial<Record<TruckingTab, number>>;
  onChange: (tab: TruckingTab) => void;
  onHelp: () => void;
}

// Real tabs (keyboard: Tab to the bar, arrow keys between tabs), used as the tab bar only — each
// tab's content renders below it. Same bar as the Warehouse module.
export const TruckingTabs = ({ active, counts, onChange, onHelp }: TruckingTabsProps) => (
  <Tabs
    activeKey={active}
    onChange={(k) => onChange(k as TruckingTab)}
    className="mt-3"
    tabBarStyle={{ marginBottom: 0 }}
    tabBarExtraContent={{
      right: (
        <span className="flex items-center gap-1">
          <Tooltip title="Trucking settings — service levels, vehicle types, margin floor, transport-order e-mail">
            <Link
              href="/trucking/settings"
              aria-label="Trucking settings"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
            >
              <SettingOutlined />
            </Link>
          </Tooltip>
          <Tooltip title="Read me — how the Trucking module works">
            <Button type="text" shape="circle" aria-label="Help" icon={<QuestionCircleOutlined />} onClick={onHelp} />
          </Tooltip>
        </span>
      ),
    }}
    items={TRUCKING_TABS.map((t) => {
      const count = counts[t.key];
      const on = active === t.key;
      return {
        key: t.key,
        label: (
          <span className="whitespace-nowrap">
            {t.label}
            {count != null && (
              <span className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold ${on ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            )}
          </span>
        ),
      };
    })}
  />
);
