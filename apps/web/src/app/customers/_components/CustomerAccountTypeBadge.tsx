"use client";

import { StarFilled } from "@ant-design/icons";
import { labelStyle } from "../_lib/constants";

// Account type (KEY ACCOUNT, STANDARD, …) as a pill in the app's status-badge shape.
export function CustomerAccountTypeBadge({ label }: { label: string }) {
  const style = labelStyle(label);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl font-medium text-[11px] px-2.5 py-0.5 leading-[18px]"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {label === "KEY ACCOUNT" && <StarFilled className="text-[10px]" />}
      {label}
    </span>
  );
}
