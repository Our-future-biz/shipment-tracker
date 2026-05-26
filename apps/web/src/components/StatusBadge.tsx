"use client";

import { Tag } from "antd";
import { getStatusStyle } from "@/lib/statusColors";

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = getStatusStyle(status);
  return (
    <Tag
      bordered={false}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderRadius: 12,
        fontWeight: 500,
        fontSize: 11,
        padding: "2px 10px",
        lineHeight: "18px",
      }}
    >
      {label ?? status}
    </Tag>
  );
}
