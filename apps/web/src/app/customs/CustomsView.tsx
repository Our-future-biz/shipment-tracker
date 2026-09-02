"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input, Select, Checkbox, Tooltip, Spin } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useShipments, getFieldValue, buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { DROPDOWN_OPTIONS, getCellConditionalStyle } from "@/lib/columnConfig";

/**
 * Columns of the Customs overview, mirroring CUSTOMS_GRID from the approved mockup.
 * `recv` columns are the document-received ticks; `edit` marks inline-editable cells.
 */
interface GridCol {
  key?: string;
  label: string;
  w: number;
  ref?: boolean;
  edit?: boolean;
  /** Which manual-override field backs this tick, and which document it follows. */
  recv?: { field: "csRecvInvoice" | "csRecvPacking"; doc: string };
}

const CUSTOMS_GRID: GridCol[] = [
  { key: "jobNumber", label: "Internal Reference", w: 150, ref: true },
  { key: "customsStatus", label: "Customs Status", w: 230, edit: true },
  { key: "customsProcedure", label: "Customs Procedure", w: 155, edit: true },
  { key: "mrn", label: "MRN Number", w: 190, edit: true },
  { recv: { field: "csRecvInvoice", doc: "Invoice" }, label: "Invoice received", w: 130 },
  { recv: { field: "csRecvPacking", doc: "Packing list" }, label: "Packing list received", w: 155 },
  { key: "typeOfPackages", label: "Type Of Packages", w: 150 },
  { key: "pcs", label: "Colli", w: 80 },
  { key: "cargoDescription", label: "Cargo Description", w: 210 },
  { key: "hsCode", label: "HS Code", w: 120 },
  { key: "totalWeightTons", label: "Total Weight In Tons", w: 155 },
  { key: "totalVolumeCbm", label: "Total Volume In CBM", w: 155 },
  { key: "containerNumber", label: "Container Number", w: 165 },
  { key: "sealNumber", label: "Seal Number", w: 130 },
  { key: "containerTypeSummary", label: "Container Type", w: 140 },
  { key: "commercialInvoice", label: "Commercial Invoice number(s)", w: 200, edit: true },
  { key: "commercialInvoiceValue", label: "Commercial Invoice(s) Valued", w: 205 },
];

const CUSTOMS_STATUSES = DROPDOWN_OPTIONS["Customs Status"] ?? [];

/**
 * A tick follows the shipment's documents until someone sets it by hand;
 * the manual value then wins (csRecvVal in the mockup).
 */
function recvValue(shipment: ShipmentItem, field: "csRecvInvoice" | "csRecvPacking", doc: string): boolean {
  const manual = (shipment[field] as string | undefined) ?? "";
  if (manual === "yes") return true;
  if (manual === "no") return false;
  return (shipment.documentTypes ?? []).includes(doc);
}

export function CustomsView() {
  const { shipments, isLoading, updateField } = useShipments();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shipments.filter((s) => {
      if (statusFilter !== "all" && (s.customsStatus || "") !== statusFilter) return false;
      if (!q) return true;
      return [s.jobNumber, s.containerNumber, s.cargoDescription, s.commercialInvoice, s.customer, s.mrn]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [shipments, search, statusFilter]);

  const toggleRecv = (s: ShipmentItem, field: "csRecvInvoice" | "csRecvPacking", doc: string) => {
    const next = recvValue(s, field, doc) ? "no" : "yes";
    updateField(s.id, field, next);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4 flex-wrap">
        <span className="text-[13px] font-semibold text-slate-600">Shipments to clear</span>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <Input
            placeholder="Search job, container, invoice…"
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-72"
          />
          <div className="w-px h-6 bg-slate-200 shrink-0" />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="w-56"
            options={[
              { value: "all", label: "All customs statuses" },
              ...CUSTOMS_STATUSES.map((o) => ({ value: o, label: o })),
            ]}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <colgroup>
              {CUSTOMS_GRID.map((c, i) => (
                <col key={i} style={{ width: `${c.w}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {CUSTOMS_GRID.map((c, i) => (
                  <th
                    key={i}
                    className={[
                      "text-[11px] font-bold uppercase tracking-wide text-slate-500 px-3 py-2.5",
                      "border-b border-slate-200 bg-slate-50 whitespace-nowrap",
                      c.recv ? "text-center" : "text-left",
                    ].join(" ")}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const rowData = buildRowData(s);
                return (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    {CUSTOMS_GRID.map((c, i) => {
                      if (c.recv) {
                        const on = recvValue(s, c.recv.field, c.recv.doc);
                        const auto = !((s[c.recv.field] as string | undefined) ?? "");
                        return (
                          <td key={i} className="px-3 py-2 border-b border-slate-100 text-center">
                            <Tooltip
                              title={
                                auto
                                  ? `Follows the ${c.recv.doc} document in the shipment — tick to set it manually`
                                  : "Set manually"
                              }
                            >
                              <Checkbox checked={on} onChange={() => toggleRecv(s, c.recv!.field, c.recv!.doc)} />
                            </Tooltip>
                          </td>
                        );
                      }

                      const value = getFieldValue(s, c.key!);
                      const style = getCellConditionalStyle(c.key!, value, rowData) ?? undefined;

                      if (c.ref) {
                        return (
                          <td key={i} className="px-3 py-2 border-b border-slate-100">
                            <Link
                              href={`/shipments/${encodeURIComponent(s.jobNumber)}?tab=customs`}
                              className="font-mono text-[11px] font-semibold text-indigo-600 hover:underline"
                            >
                              {value || "—"}
                            </Link>
                          </td>
                        );
                      }

                      return (
                        <td key={i} className="px-3 py-2 border-b border-slate-100" style={style}>
                          {value ? (
                            <span className="text-slate-700">{value}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              No shipment matches the filter.
            </div>
          )}
        </div>
        <div className="flex items-center justify-end px-4 py-2.5 border-t border-slate-200 bg-slate-50/60">
          <span className="text-[11px] text-slate-500">
            {rows.length} of {shipments.length} entries
          </span>
        </div>
      </div>
    </>
  );
}
