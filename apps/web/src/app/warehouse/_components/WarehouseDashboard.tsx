"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getFieldValue, useShipments, type ShipmentItem } from "@/hooks/useShipments";
import { useAuth } from "@/lib/auth/AuthContext";
import { useColumnView } from "@/hooks/useColumnView";
import { COLUMN_MAP, DATE_COLUMNS } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { StatusBadge } from "@/components/StatusBadge";
import { ColumnPicker } from "@/app/shipments/_components/ColumnPicker";
import { DimensionsModal } from "@/app/shipments/_components/DimensionsModal";
import { useToast } from "@/lib/toast";
import { WAREHOUSE_DEFAULT_COLUMNS, WAREHOUSE_LEAD_COLUMN, WAREHOUSE_RULES, WAREHOUSE_SECTIONS, type WarehouseSection } from "./warehouseRules";

// The Warehouse overview: In Warehouse, Stock and Out Warehouse one under another, each
// with its count and the shipments it holds right now. Read-only apart from the Dimensions
// dialog; the moves (Naskladnit, Vyskladnit) are made on the section's own page, which the
// heading opens.
// Which shipment columns the three lists show is the user's choice (the cog); the columns
// and their named templates are this page's own, apart from Shipments and the sections.

const ORDER: WarehouseSection[] = ["in", "stock", "out"];

const COLUMN_VIEW = { scope: "warehouse-dashboard", defaults: WAREHOUSE_DEFAULT_COLUMNS };

const EMPTY: Record<WarehouseSection, string> = {
  in: "No shipment is due at the warehouse in the next 7 days.",
  stock: "Nothing in stock.",
  out: "Nothing has left the warehouse yet.",
};

function columnsFor(section: WarehouseSection, chosen: string[], openDimensions: (shipmentId: string) => void): ColumnsType<ShipmentItem> {
  const lead = WAREHOUSE_LEAD_COLUMN[section];
  const keys = lead ? [lead, ...chosen.filter((k) => k !== lead)] : chosen;
  return keys.flatMap((key) => {
    const col = COLUMN_MAP.get(key);
    if (!col || col.type === "popup") return [];
    return [
      {
        title: col.title,
        key,
        width: col.width,
        render: (_: unknown, s: ShipmentItem) => {
          if (key === "jobNumber") {
            return (
              <Link href={`/warehouse/${s.id}?from=${section}`} className="font-mono font-bold text-indigo-500 hover:underline">
                {s.jobNumber || "—"}
              </Link>
            );
          }
          if (key === "dimensionsSummary") {
            return (
              <button
                onClick={() => openDimensions(s.id)}
                className="text-indigo-500 hover:underline font-medium bg-transparent border-none p-0 cursor-pointer"
              >
                Click for Preview
              </button>
            );
          }
          const raw = getFieldValue(s, key);
          const value = DATE_COLUMNS.has(key) ? formatDate(raw) || raw : raw;
          if (!value) return <span className="text-slate-300">{"—"}</span>;
          return key === "status" ? <StatusBadge status={value} /> : value;
        },
      },
    ];
  });
}

export function WarehouseDashboard() {
  const { user, token } = useAuth();
  const { shipments, isLoading, updateShipment } = useShipments();
  const toast = useToast();
  const [dimsShipmentId, setDimsShipmentId] = useState<string | null>(null);
  const { visible, setVisible, templates, activeTemplateId, isDirty, applyTemplate, deactivate, saveAsTemplate, deleteTemplate } =
    useColumnView(user?.id, token, COLUMN_VIEW);
  const bySection = useMemo(
    () => Object.fromEntries(ORDER.map((k) => [k, shipments.filter(WAREHOUSE_RULES[k])])) as Record<WarehouseSection, ShipmentItem[]>,
    [shipments],
  );

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900 m-0">Warehouse</h1>
          <ColumnPicker
            visible={visible}
            onChange={setVisible}
            templates={templates}
            activeTemplateId={activeTemplateId}
            isDirty={isDirty}
            onApplyTemplate={applyTemplate}
            onDeactivate={deactivate}
            onSaveTemplate={saveAsTemplate}
            onDeleteTemplate={deleteTemplate}
          />
        </div>

        {ORDER.map((section) => (
          <section key={section} className="data-table bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Link href={`/warehouse/${section}`} className="text-[15px] font-semibold text-slate-900 hover:text-indigo-600">
                  {WAREHOUSE_SECTIONS[section]}
                </Link>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 tabular-nums">
                  {isLoading ? "…" : bySection[section].length}
                </span>
              </div>
              <Link href={`/warehouse/${section}`} className="text-[13px] text-indigo-500 hover:text-indigo-600">
                Open
              </Link>
            </div>
            <Table<ShipmentItem>
              dataSource={bySection[section]}
              columns={columnsFor(section, visible, setDimsShipmentId)}
              rowKey="id"
              size="small"
              loading={isLoading}
              pagination={bySection[section].length > 10 ? { pageSize: 10, size: "small", showSizeChanger: false } : false}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: <span className="text-[13px] text-slate-400">{EMPTY[section]}</span> }}
            />
          </section>
        ))}

        <DimensionsModal
          shipment={shipments.find((s) => s.id === dimsShipmentId) ?? null}
          onClose={() => setDimsShipmentId(null)}
          onSave={(shipment, cargoDimensions) =>
            updateShipment({ id: shipment.id, data: { cargoDimensions } }).catch((e) => {
              toast.error("Could not save the dimensions");
              throw e;
            })
          }
        />
      </div>
    </div>
  );
}
