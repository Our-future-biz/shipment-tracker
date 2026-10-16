"use client";

import Link from "next/link";
import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import { statusLabel, statusTagColor } from "@/lib/shipmentStatus";
import { EMPTY_CELL } from "../../_lib/customerTable";

const RECENT_COUNT = 5;

// Statuses run to 50+ characters: the tag is cut to its column and keeps the full text as a tooltip.
const STATUS_TAG_CLASS = "!m-0 max-w-full truncate";

const COLUMNS: ColumnsType<ShipmentItem> = [
  {
    title: "Job no.",
    dataIndex: "jobNumber",
    width: 130,
    // The shipment page is addressed by the shipment ID, not by the job number.
    render: (v: string, r) => (
      <Link href={`/shipments/${r.id}`} className="font-mono font-semibold text-indigo-600 hover:underline whitespace-nowrap">
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
        <Tag color={statusTagColor(v)} title={statusLabel(v)} className={STATUS_TAG_CLASS}>
          {statusLabel(v)}
        </Tag>
      ) : (
        EMPTY_CELL
      ),
  },
  { title: "Freight mode", dataIndex: "freightMode", width: 130, render: (v: string) => v || EMPTY_CELL },
  { title: "Load type", dataIndex: "loadType", width: 130, render: (v: string) => v || EMPTY_CELL },
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
          className="bg-transparent border-0 p-0 text-xs font-semibold text-indigo-600 whitespace-nowrap cursor-pointer hover:underline"
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
