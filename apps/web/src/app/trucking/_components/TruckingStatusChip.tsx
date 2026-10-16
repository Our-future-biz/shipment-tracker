"use client";

import { Tooltip } from "antd";
import { Badge } from "@/components/Badge";
import type { StatusChip } from "../_lib/consignments";

interface TruckingStatusChipProps {
  chip: StatusChip;
}

// The status of a consignment or trip, in the Warehouse's badge style, with what it means on hover.
export const TruckingStatusChip = ({ chip }: TruckingStatusChipProps) => (
  <Tooltip title={chip.hint} mouseEnterDelay={0.4}>
    <span className="inline-flex">
      <Badge tone={chip.tone}>{chip.label}</Badge>
    </span>
  </Tooltip>
);
