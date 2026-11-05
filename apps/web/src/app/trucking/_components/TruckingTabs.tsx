"use client";

import Link from "next/link";
import { Tabs, Tooltip } from "antd";
import { QuestionCircleOutlined, SettingOutlined } from "@ant-design/icons";
import { ICON_BTN_GHOST } from "@/styles/ui";
import { LINK_ICON_BTN_GHOST } from "../_lib/linkButtons";
import { TRUCKING_TABS, type TruckingTab } from "../_lib/tabs";

interface TruckingTabsProps {
  active: TruckingTab;
  /** Count pill per tab; a tab without a count shows none. */
  counts: Partial<Record<TruckingTab, number>>;
  /** Work-queue tabs: what their count is (read out), shown red while above zero. */
  queues?: Partial<Record<TruckingTab, string>>;
  onChange: (tab: TruckingTab) => void;
  onHelp: () => void;
}

// Real tabs (keyboard: Tab to the bar, arrow keys between tabs), used as the tab bar only — each
// tab's content renders below it. Same bar as the Warehouse module; settings and help are the app's frameless icon buttons.
export const TruckingTabs = ({ active, counts, queues = {}, onChange, onHelp }: TruckingTabsProps) => (
  <Tabs
    activeKey={active}
    onChange={(k) => onChange(k as TruckingTab)}
    className="mt-3 [&>.ant-tabs-nav]:!mb-0"
    tabBarExtraContent={{
      right: (
        <span className="flex items-center gap-1">
          <Tooltip title="Trucking settings — service levels, vehicle types, margin floor, free waiting time, transport-order e-mail, fuel index">
            <Link href="/trucking/settings" aria-label="Trucking settings" className={LINK_ICON_BTN_GHOST}>
              <SettingOutlined />
            </Link>
          </Tooltip>
          <Tooltip title="Read me — how the Trucking module works">
            <button type="button" aria-label="Help" className={ICON_BTN_GHOST} onClick={onHelp}>
              <QuestionCircleOutlined />
            </button>
          </Tooltip>
        </span>
      ),
    }}
    items={TRUCKING_TABS.map((t) => {
      const count = counts[t.key];
      const on = active === t.key;
      const queue = queues[t.key];
      let tone = on ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500";
      if (queue && count) tone = "bg-red-50 text-red-600";
      return {
        key: t.key,
        label: (
          <span className="whitespace-nowrap">
            {t.label}
            {count != null && (
              <span title={queue ? `${count} ${queue}` : undefined} className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold ${tone}`}>
                {count}
                {queue && <span className="sr-only"> {queue}</span>}
              </span>
            )}
          </span>
        ),
      };
    })}
  />
);
