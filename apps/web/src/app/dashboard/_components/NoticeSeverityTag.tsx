"use client";

import { Tag } from "antd";
import { SEVERITIES } from "../_lib/boards";

export function NoticeSeverityTag({ severity }: { severity: string }) {
  const meta = SEVERITIES.find((s) => s.value === severity);
  return (
    <Tag color={meta?.color ?? "default"} className="!m-0">
      {meta?.label ?? severity}
    </Tag>
  );
}
