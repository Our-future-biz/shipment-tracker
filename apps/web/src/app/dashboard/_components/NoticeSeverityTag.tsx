"use client";

import { ExclamationCircleFilled, InfoCircleFilled } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import { SEVERITIES } from "../_lib/boards";

export function NoticeSeverityTag({ severity }: { severity: string }) {
  const meta = SEVERITIES.find((s) => s.value === severity);
  return (
    <Pill tone={meta?.tone ?? "slate"}>
      {severity === "info" ? <InfoCircleFilled /> : <ExclamationCircleFilled />}
      {meta?.label ?? severity}
    </Pill>
  );
}
