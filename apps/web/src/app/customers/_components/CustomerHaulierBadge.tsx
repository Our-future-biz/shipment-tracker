"use client";

import { CarOutlined } from "@ant-design/icons";
import { PILL_CLASS } from "@/components/Pill";
import type { interfaces } from "@/lib/api/client";
import { CUSTOMER_ROLE_LABELS } from "../_lib/constants";
import { useModules } from "@/lib/auth/AuthContext";

interface CustomerHaulierBadgeProps {
  roles: interfaces.CustomerRole[];
}

// Marks a company we subcontract trucking to. Being a customer is the norm and gets no badge.
export function CustomerHaulierBadge({ roles }: CustomerHaulierBadgeProps) {
  const { isEnabled } = useModules();
  if (!roles.includes("haulier") || !isEnabled("trucking_concept")) return null;
  return (
    <span className={`${PILL_CLASS} bg-teal-100 text-teal-700`}>
      <CarOutlined className="text-[10px]" />
      {CUSTOMER_ROLE_LABELS.haulier}
    </span>
  );
}
