"use client";

import { StarFilled } from "@ant-design/icons";
import { labelClass } from "../_lib/constants";

// Account type (KEY ACCOUNT, STANDARD, …) as a pill in the app's status-badge shape.
export function CustomerAccountTypeBadge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-xl font-medium text-[11px] px-2.5 py-0.5 leading-[18px] ${labelClass(label)}`}
    >
      {label === "KEY ACCOUNT" && <StarFilled className="text-[10px]" />}
      {label}
    </span>
  );
}
