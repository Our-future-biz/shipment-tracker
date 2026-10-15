"use client";

import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, EditOutlined, HistoryOutlined, SwapOutlined } from "@ant-design/icons";
import { Pill } from "@/components/Pill";
import { VERSION_STATUS_CHIP, type TariffVersionStatus } from "../_lib/tariffs";

const ICONS: Record<TariffVersionStatus, ReactNode> = {
  DRAFT: <EditOutlined aria-hidden />,
  SCHEDULED: <ClockCircleOutlined aria-hidden />,
  ACTIVE: <CheckCircleOutlined aria-hidden />,
  EXPIRED: <HistoryOutlined aria-hidden />,
  SUPERSEDED: <SwapOutlined aria-hidden />,
};

interface TariffVersionStatusChipProps {
  status: TariffVersionStatus;
}

// A tariff version's status: icon and word as well as colour.
export const TariffVersionStatusChip = ({ status }: TariffVersionStatusChipProps) => {
  const chip = VERSION_STATUS_CHIP[status];
  return (
    <Tooltip title={chip.hint} mouseEnterDelay={0.4}>
      <Pill tone={chip.tone}>
        {ICONS[status]}
        {chip.label}
      </Pill>
    </Tooltip>
  );
};
