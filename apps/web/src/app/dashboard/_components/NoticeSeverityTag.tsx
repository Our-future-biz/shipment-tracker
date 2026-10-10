"use client";

import { Tag } from "antd";
import { ExclamationCircleFilled, InfoCircleFilled } from "@ant-design/icons";
import { SEVERITIES } from "../_lib/boards";

export function NoticeSeverityTag({ severity }: { severity: string }) {
  const meta = SEVERITIES.find((s) => s.value === severity);
  return (
    <Tag color={meta?.color ?? "default"} icon={severity === "info" ? <InfoCircleFilled /> : <ExclamationCircleFilled />} className="!m-0">
      {meta?.label ?? severity}
    </Tag>
  );
}
