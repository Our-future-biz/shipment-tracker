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
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "8px 0" : "8px 12px",
          borderRadius: 6,
          fontSize: 13,
          color: isActive ? "#6366f1" : "#64748b",
          background: isActive ? "#f0f0ff" : "transparent",
          cursor: "pointer",
          marginBottom: 2,
          transition: "all 0.15s",
          position: "relative",
        }}
      >
        <span style={{ fontSize: 14, width: collapsed ? "auto" : 18, textAlign: "center", flexShrink: 0 }}>
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge !== undefined && (
              <span style={{ fontSize: 10, color: item.badgeColor ?? "#94a3b8" }}>
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && item.badge !== undefined && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: item.badgeColor ?? "#94a3b8",
              color: "white",
              fontSize: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
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
      style={{
        width,
        background: "#fff",
        borderRight: "1px solid #e2e8f0",
        padding: collapsed ? "12px 4px" : "12px 8px",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {header && !collapsed && <div style={{ marginBottom: 8 }}>{header}</div>}

      {!collapsed && (
        <div
          style={{
            fontSize: 10,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            padding: "4px 12px",
            fontWeight: 500,
          }}
        >
          Sections
        </div>
      )}

      <div style={{ flex: 1 }}>
        {items.map(renderItem)}
        {bottomItems && bottomItems.length > 0 && (
          <>
            <div style={{ borderTop: "1px solid #e2e8f0", margin: "6px 0" }} />
            {!collapsed && (
              <div
                style={{
                  fontSize: 10,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  padding: "4px 12px",
                  fontWeight: 500,
                }}
              >
                Tools
              </div>
            )}
            {bottomItems.map(renderItem)}
          </>
        )}
      </div>

      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 0",
          cursor: "pointer",
          color: "#94a3b8",
          borderTop: "1px solid #e2e8f0",
          marginTop: 8,
        }}
      >
        {collapsed ? <RightOutlined style={{ fontSize: 12 }} /> : <LeftOutlined style={{ fontSize: 12 }} />}
      </div>
    </div>
  );
}
