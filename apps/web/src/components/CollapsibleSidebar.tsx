"use client";

import { Tooltip } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

interface NavItem {
  key: string;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  badgeColor?: string;
}

interface CollapsibleSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  header?: ReactNode;
  bottomItems?: NavItem[];
}

const EXPANDED_WIDTH = 180;
const COLLAPSED_WIDTH = 44;
// A group's caption ("Sections", "Tools"): the type of LABEL_TEXT, muted, so it does not outshout the items.
const GROUP_LABEL = "text-[11px] leading-[14px] font-bold uppercase tracking-wide text-slate-400";

export function CollapsibleSidebar({
  collapsed,
  onToggle,
  items,
  activeKey,
  onSelect,
  header,
  bottomItems,
}: CollapsibleSidebarProps) {
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const renderItem = (item: NavItem) => {
    const isActive = item.key === activeKey;
    const content = (
      <div
        key={item.key}
        onClick={() => onSelect(item.key)}
        className={`flex items-center rounded-md text-[13px] cursor-pointer mb-0.5 transition-all duration-150 relative ${
          collapsed ? "justify-center gap-0 py-2" : "justify-start gap-2 px-3 py-2"
        } ${
          isActive
            ? "font-medium text-indigo-600 bg-indigo-50"
            : "text-slate-500 bg-transparent hover:text-slate-900 hover:bg-slate-100"
        }`}
      >
        <span className={`text-sm text-center shrink-0 ${collapsed ? "w-auto" : "w-[18px]"}`}>
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge !== undefined && (
              <span className={`text-[10px] ${item.badgeColor ? "" : "text-slate-400"}`} style={item.badgeColor ? { color: item.badgeColor } : undefined}>
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && item.badge !== undefined && (
          <span
            className={`absolute top-1 right-0.5 w-3.5 h-3.5 rounded-full text-white text-[10px] flex items-center justify-center font-semibold ${item.badgeColor ? "" : "bg-slate-400"}`}
            // A badge colour the caller gives is a value, so it stays inline.
            style={item.badgeColor ? { background: item.badgeColor } : undefined}
          >
            {typeof item.badge === "number" ? item.badge : ""}
          </span>
        )}
      </div>
    );

    return collapsed ? (
      <Tooltip key={item.key} title={item.label} placement="right">
        {content}
      </Tooltip>
    ) : (
      content
    );
  };

  return (
    <div
      className={`bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden py-3 ${
        collapsed ? "px-1" : "px-2"
      }`}
      // The width comes from the caller (and animates), so it stays inline.
      style={{ width }}
    >
      {header && !collapsed && <div className="mb-2">{header}</div>}

      {!collapsed && (
        <div className={`${GROUP_LABEL} px-3 py-1`}>
          Sections
        </div>
      )}

      <div className="flex-1">
        {items.map(renderItem)}
        {bottomItems && bottomItems.length > 0 && (
          <>
            <div className="border-t border-slate-200 my-1.5" />
            {!collapsed && (
              <div className={`${GROUP_LABEL} px-3 py-1`}>
                Tools
              </div>
            )}
            {bottomItems.map(renderItem)}
          </>
        )}
      </div>

      <div
        onClick={onToggle}
        className="flex items-center justify-center py-2 cursor-pointer text-slate-400 hover:text-slate-900 border-t border-slate-200 mt-2"
      >
        {collapsed ? <RightOutlined className="text-xs" /> : <LeftOutlined className="text-xs" />}
      </div>
    </div>
  );
}
