"use client";

import { StarFilled } from "@ant-design/icons";
import { PILL_CLASS } from "@/components/Pill";
import { labelClass } from "../_lib/constants";

interface CustomerAccountTypeBadgeProps {
  label: string;
}

// Account type (KEY ACCOUNT, STANDARD, …) as a pill in the app's status-badge shape.
export function CustomerAccountTypeBadge({ label }: CustomerAccountTypeBadgeProps) {
  return (
    <span className={`${PILL_CLASS} ${labelClass(label)}`}>
      {label === "KEY ACCOUNT" && <StarFilled className="text-[10px]" />}
      {label}
    </span>
  );
}
