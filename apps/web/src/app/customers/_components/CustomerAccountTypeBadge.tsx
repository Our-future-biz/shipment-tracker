"use client";

import { StarFilled } from "@ant-design/icons";
import { Badge } from "@/components/Badge";
import { labelTone } from "../_lib/constants";

interface CustomerAccountTypeBadgeProps {
  label: string;
}

// Account type (KEY ACCOUNT, STANDARD, …) as a badge, in the shape of every pill.
export function CustomerAccountTypeBadge({ label }: CustomerAccountTypeBadgeProps) {
  return (
    <Badge tone={labelTone(label)}>
      {label === "KEY ACCOUNT" && <StarFilled className="text-[10px]" />}
      {label}
    </Badge>
  );
}
