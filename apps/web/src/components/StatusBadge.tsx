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
      className="rounded-xl font-medium text-[11px] px-2.5 py-0.5 leading-[18px]"
      style={{
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {label ?? status}
    </Tag>
  );
}
