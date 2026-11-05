"use client";

import Link from "next/link";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import { StatusBadge } from "@/components/StatusBadge";
import { loadTypeLabel } from "@/lib/enums";
import { EMPTY_CELL } from "../../_lib/customerTable";
import { LINK } from "@/styles/ui";

const RECENT_COUNT = 5;

// Statuses run to 50+ characters: the badge is cut to its column and keeps the full text as a tooltip.
const STATUS_BADGE_CLASS = "max-w-full truncate";

const COLUMNS: ColumnsType<ShipmentItem> = [
  {
    title: "Job no.",
    dataIndex: "jobNumber",
    // Fits the longest reference, CZPROJECT00000023, as the Shipments grid does.
    width: 170,
    // The shipment page is addressed by the shipment ID, not by the job number.
    render: (v: string, r) => (
      <Link href={`/shipments/${r.id}`} className={`tabular-nums font-semibold whitespace-nowrap ${LINK}`}>
        {v}
      </Link>
    ),
  },
  { title: "Direction", dataIndex: "tradeDirection", width: 100, render: (v: string) => v || EMPTY_CELL },
  {
    title: "Status",
    dataIndex: "status",
    ellipsis: true,
    render: (v: string) =>
      v ? (
        <StatusBadge status={v} className={STATUS_BADGE_CLASS} />
      ) : (
        EMPTY_CELL
      ),
  },
  { title: "Freight mode", dataIndex: "freightMode", width: 130, render: (v: string) => v || EMPTY_CELL },
  { title: "Load type", dataIndex: "loadType", width: 130, render: (v: string, r) => loadTypeLabel(v, r.freightMode) || EMPTY_CELL },
];

interface CustomerRecentShipmentsCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Teaser of the Shipments tab: the newest few shipments, each linking to its own page.
export function CustomerRecentShipmentsCard({ customerId, onSelectTab }: CustomerRecentShipmentsCardProps) {
  const { shipments, isLoading, isError } = useCustomerShipments(customerId);
  // The hook returns shipments newest first.
  const recent = shipments.slice(0, RECENT_COUNT);

  let emptyText = "No shipments for this customer yet";
  if (isError) emptyText = "Could not load shipments.";

  return (
    <SectionCard
      title="Recent shipments"
      bodyClassName="p-2"
      extra={
        <button
          type="button"
          onClick={() => onSelectTab("shipments")}
          className={`bg-transparent border-0 p-0 text-xs font-semibold whitespace-nowrap cursor-pointer ${LINK}`}
        >
          View all
        </button>
      }
    >
      {/* A grid with visible lines, one row per shipment, as the tables of the other tabs. */}
      <Table<ShipmentItem>
        size="small"
        bordered
        rowKey="id"
        loading={isLoading}
        dataSource={recent}
        columns={COLUMNS}
        pagination={false}
        scroll={{ x: 620 }}
        locale={{ emptyText }}
      />
    </SectionCard>
  );
}
