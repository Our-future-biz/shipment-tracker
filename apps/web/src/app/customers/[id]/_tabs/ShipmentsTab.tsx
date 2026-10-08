"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { Button, Input, Select, Table, Tag } from "antd";
import { DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { CUSTOMER_SHIPMENTS_LIMIT, useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import { useCustomer } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import { isCompletedStatus } from "@/lib/enums";
import { statusTagColor } from "@/lib/shipmentStatus";
import { useToast } from "@/lib/toast";
import { fmtMoney, marginPct, num } from "../../_lib/customerMoney";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { CustomerKpiTile, KPI_GRID_CLASS } from "../_components/CustomerKpiTile";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface ShipmentsTabProps {
  customerId: string;
}

// Status, mode and direction are free text on a shipment ("Billed [IMP]", "Sea Freight"), so the
// filters offer the values the rows actually carry: a fixed list would offer ones no row matches.
function distinctOptions(values: string[]): { value: string; label: string }[] {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

function profitClassName(profit: number): string | undefined {
  if (profit > 0) return "text-green-600";
  if (profit < 0) return "text-red-600";
  return undefined;
}

// The one list of a customer's shipments. Revenue / Profit / Margin totals live in the page
// header (from the server rollup); the tiles here only count the rows that are loaded.
export function ShipmentsTab({ customerId }: ShipmentsTabProps) {
  const { shipments, isCapped, isLoading, isError, deleteShipment, isDeleting } = useCustomerShipments(customerId);
  const { customer } = useCustomer(customerId);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>();
  const [mode, setMode] = useState<string>();
  const [direction, setDirection] = useState<string>();
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ShipmentItem | null>(null);

  const currency = customer?.currency || undefined;
  const completedCount = useMemo(() => shipments.filter((s) => isCompletedStatus(s.status)).length, [shipments]);

  const statusOptions = useMemo(() => distinctOptions(shipments.map((s) => s.status)), [shipments]);
  const modeOptions = useMemo(() => distinctOptions(shipments.map((s) => s.freightMode)), [shipments]);
  const directionOptions = useMemo(() => distinctOptions(shipments.map((s) => s.tradeDirection)), [shipments]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shipments.filter((s) => {
      if (query && !`${s.jobNumber} ${s.pol} ${s.pod}`.toLowerCase().includes(query)) return false;
      if (status && s.status !== status) return false;
      if (mode && s.freightMode !== mode) return false;
      if (direction && s.tradeDirection !== direction) return false;
      return true;
    });
  }, [shipments, search, status, mode, direction]);

  // antd keeps the current page when the rows change, so a narrowed list would open on a later
  // page with its first matches hidden. Every filter change therefore returns to page 1.
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (value?: string) => {
    setStatus(value);
    setPage(1);
  };

  const handleModeChange = (value?: string) => {
    setMode(value);
    setPage(1);
  };

  const handleDirectionChange = (value?: string) => {
    setDirection(value);
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShipment(deleteTarget.id);
      toast.success("Order deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete order");
    }
  };

  let emptyText = "No shipments for this customer yet";
  if (shipments.length > 0) emptyText = "No shipments match the filters";
  if (isError) emptyText = "Could not load shipments.";

  // Statuses are long, so on a narrow screen the table scrolls sideways; the money columns
  // are pinned to the right so they stay in view while it does.
  const columns: ColumnsType<ShipmentItem> = [
    {
      title: "Job #",
      dataIndex: "jobNumber",
      width: 130,
      // The shipment page is addressed by the shipment ID, not by the job number.
      render: (v: string, r) => (
        <Link href={`/shipments/${r.id}`} className="font-mono font-semibold text-indigo-600 hover:underline">
          {v}
        </Link>
      ),
    },
    { title: "Mode", dataIndex: "freightMode", width: 110, render: (v: string) => v || EMPTY_CELL },
    { title: "Direction", dataIndex: "tradeDirection", width: 90, render: (v: string) => v || EMPTY_CELL },
    {
      title: "Route",
      key: "route",
      width: 180,
      render: (_: unknown, r) => {
        if (!r.pol && !r.pod) return EMPTY_CELL;
        return (
          <span className="text-slate-600">
            {r.pol || "—"} <span className="text-slate-300">→</span> {r.pod || "—"}
          </span>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 140,
      render: (v: string) =>
        v ? (
          <Tag color={statusTagColor(v)} className="!m-0">
            {v}
          </Tag>
        ) : (
          EMPTY_CELL
        ),
    },
    { title: "ETD", dataIndex: "estimatedDeparture", width: 100, render: (v: string | null) => formatDate(v) || EMPTY_CELL },
    { title: "ETA", dataIndex: "estimatedArrival", width: 100, render: (v: string | null) => formatDate(v) || EMPTY_CELL },
    {
      title: "Revenue",
      key: "revenue",
      width: 110,
      fixed: "right",
      align: "right",
      className: "tabular-nums",
      render: (_: unknown, r) => fmtMoney(num(r.selling), currency),
    },
    {
      title: "Cost",
      key: "cost",
      width: 110,
      fixed: "right",
      align: "right",
      className: "tabular-nums",
      render: (_: unknown, r) => fmtMoney(num(r.buying), currency),
    },
    {
      title: "Profit",
      key: "profit",
      width: 110,
      fixed: "right",
      align: "right",
      className: "tabular-nums",
      render: (_: unknown, r) => {
        const profit = num(r.selling) - num(r.buying);
        return <span className={profitClassName(profit)}>{fmtMoney(profit, currency)}</span>;
      },
    },
    {
      title: "Margin %",
      key: "margin",
      width: 90,
      fixed: "right",
      align: "right",
      className: "tabular-nums",
      render: (_: unknown, r) => {
        const revenue = num(r.selling);
        // Without revenue there is nothing to take a percentage of.
        if (!revenue) return EMPTY_CELL;
        return `${marginPct(revenue, revenue - num(r.buying))}%`;
      },
    },
    {
      title: "",
      key: "actions",
      width: 48,
      fixed: "right",
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete order ${r.jobNumber}`}
            onClick={() => setDeleteTarget(r)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className={KPI_GRID_CLASS}>
        <CustomerKpiTile label="Active" value={shipments.length - completedCount} />
        <CustomerKpiTile label="Completed" value={completedCount} />
      </div>

      <SectionCard title="Shipments" bodyClassName="p-2" extra={<CustomerCountChip count={shipments.length} />}>
        <div className="flex flex-wrap items-center gap-3 px-2 pb-3">
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Search job #, POL, POD"
            aria-label="Search shipments"
            value={search}
            onChange={handleSearchChange}
            // antd sets the input to width: 100% outside Tailwind's cascade layers, so the width needs the important flag.
            className="!w-60"
          />
          {/* Statuses are long, so the dropdown may be wider than the field. */}
          <Select
            allowClear
            placeholder="All statuses"
            aria-label="Filter by status"
            value={status}
            onChange={handleStatusChange}
            options={statusOptions}
            popupMatchSelectWidth={false}
            className="w-44"
          />
          <Select
            allowClear
            placeholder="All modes"
            aria-label="Filter by mode"
            value={mode}
            onChange={handleModeChange}
            options={modeOptions}
            className="w-44"
          />
          <Select
            allowClear
            placeholder="All directions"
            aria-label="Filter by direction"
            value={direction}
            onChange={handleDirectionChange}
            options={directionOptions}
            className="w-44"
          />
          <span className="ml-auto text-xs text-slate-500 tabular-nums">
            {filtered.length} of {shipments.length}
          </span>
        </div>

        <Table<ShipmentItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          dataSource={filtered}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={{ ...TABLE_PAGINATION, current: page, onChange: setPage }}
          locale={{ emptyText }}
        />

        {isCapped && <div className="px-2 pt-2 text-xs text-slate-400">Showing the newest {CUSTOMER_SHIPMENTS_LIMIT} shipments.</div>}
      </SectionCard>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete order"
        description={`Delete order ${deleteTarget?.jobNumber ?? ""}? This deletes the shipment for the whole company, not only on this customer's page. It will be archived with all its details (not erased), its reference can never be reused, and the action is recorded against your account.`}
        confirmLabel="Delete"
        danger
        loading={isDeleting}
      />
    </div>
  );
}
