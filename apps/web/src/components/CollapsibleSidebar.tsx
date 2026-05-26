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
          collapsed ? "justify-center py-2" : "justify-start px-3 py-2"
        } ${
          isActive
            ? "text-indigo-500 bg-indigo-50"
            : "text-slate-500 bg-transparent"
        }`}
        style={{ gap: collapsed ? 0 : 8 }}
      >
        <span className={`text-sm text-center shrink-0 ${collapsed ? "w-auto" : "w-[18px]"}`}>
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge !== undefined && (
              <span className="text-[10px]" style={{ color: item.badgeColor ?? "#94a3b8" }}>
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && item.badge !== undefined && (
          <span
            className="absolute top-1 right-0.5 w-3.5 h-3.5 rounded-full text-white text-[8px] flex items-center justify-center font-semibold"
            style={{ background: item.badgeColor ?? "#94a3b8" }}
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
      className="bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{
        width,
        padding: collapsed ? "12px 4px" : "12px 8px",
      }}
    >
      {header && !collapsed && <div className="mb-2">{header}</div>}

      {!collapsed && (
        <div className="text-[10px] text-slate-400 uppercase tracking-wide px-3 py-1 font-medium">
          Sections
        </div>
      )}

      <div className="flex-1">
        {items.map(renderItem)}
        {bottomItems && bottomItems.length > 0 && (
          <>
            <div className="border-t border-slate-200 my-1.5" />
            {!collapsed && (
              <div className="text-[10px] text-slate-400 uppercase tracking-wide px-3 py-1 font-medium">
                Tools
              </div>
            )}
            {bottomItems.map(renderItem)}
          </>
        )}
      </div>

      <div
        onClick={onToggle}
        className="flex items-center justify-center py-2 cursor-pointer text-slate-400 border-t border-slate-200 mt-2"
      >
        {collapsed ? <RightOutlined className="text-xs" /> : <LeftOutlined className="text-xs" />}
      </div>
    </div>
  );
}
