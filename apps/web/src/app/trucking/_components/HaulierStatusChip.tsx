"use client";

import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined, StopOutlined } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import { HAULIER_STATUS_CHIP, type HaulierStatus } from "../_lib/hauliers";

const ICONS: Record<HaulierStatus, ReactNode> = {
  ok: <CheckCircleOutlined aria-hidden />,
  warning: <ExclamationCircleOutlined aria-hidden />,
  blocked: <StopOutlined aria-hidden />,
};

interface HaulierStatusChipProps {
  status: HaulierStatus;
}

// A haulier's status: icon and word as well as colour.
export const HaulierStatusChip = ({ status }: HaulierStatusChipProps) => {
  const chip = HAULIER_STATUS_CHIP[status];
  return (
    <Tooltip title={chip.hint} mouseEnterDelay={0.4}>
      <Pill tone={chip.tone}>
        {ICONS[status]}
        {chip.label}
      </Pill>
    </Tooltip>
  );
};
