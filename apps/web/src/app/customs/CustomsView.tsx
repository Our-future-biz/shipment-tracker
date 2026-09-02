"use client";

import { useMemo, useRef, useState } from "react";
import { Input, Select, Checkbox, Tooltip, Spin } from "antd";
import { SearchOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useShipments, getFieldValue, buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { DROPDOWN_OPTIONS, getCellConditionalStyle, COLUMN_MAP } from "@/lib/columnConfig";
import { CustomsTab } from "@/app/shipments/[jobNumber]/tabs/CustomsTab";

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
  // Shipment opened inside Customs (csDetailId in the mockup) — the same
  // interface as the Customs tab in the shipment detail, without leaving here.
  const [openId, setOpenId] = useState<string | null>(null);
  // Cell being edited after a double-click: which shipment + which column.
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [draft, setDraft] = useState("");
  const committedRef = useRef(false);

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
    const wanted = !recvValue(s, field, doc);
    const fromDocuments = (s.documentTypes ?? []).includes(doc);
    // If the manual choice matches what the documents say, drop the override and
    // let the tick follow the documents again (same as the mockup).
    updateField(s.id, field, wanted === fromDocuments ? "" : wanted ? "yes" : "no");
  };

  const startEdit = (s: ShipmentItem, key: string) => {
    setEditing({ id: s.id, key });
    setDraft(getFieldValue(s, key));
    committedRef.current = false;
  };

  const commitEdit = () => {
    if (!editing || committedRef.current) return;
    committedRef.current = true;
    const current = shipments.find((x) => x.id === editing.id);
    if (current && draft !== getFieldValue(current, editing.key)) {
      updateField(editing.id, editing.key, draft);
    }
    setEditing(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin />
      </div>
    );
  }

  // Detail of one shipment, shown inside Customs (mockup: csDetailId branch).
  const openShipment = openId ? shipments.find((x) => x.id === openId) : null;
  if (openShipment) {
    return (
      <>
        <div className="flex items-center gap-3.5 mb-4">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-[#d8dce6] bg-white text-slate-600 text-[12.5px] font-semibold cursor-pointer hover:bg-[#f4f5f9] hover:text-[#46506b] transition-colors"
          >
            <ArrowLeftOutlined /> Customs
          </button>
          <span className="font-mono text-[18px] font-bold tracking-[.02em] text-[#10141f]">
            {openShipment.jobNumber}
          </span>
          {openShipment.customer && (
            <span className="text-[13px] font-semibold text-slate-600">{openShipment.customer}</span>
          )}
        </div>
        <CustomsTab
          shipment={openShipment}
          onCommit={(fieldKey, value) => updateField(openShipment.id, fieldKey, value)}
        />
      </>
    );
  }

  return (
    <>
      {/* Toolbar */}
      {/* .toolbar from the mockup: 12/16 padding, 16px radius, 12px gaps */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4 flex-wrap">
        <span className="text-[13px] font-semibold text-slate-600">Shipments to clear</span>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* .tb-search: 240px wide, 6px radius, 14px text */}
          <Input
            placeholder="Search job, container, invoice…"
            prefix={<SearchOutlined className="text-slate-400 text-[13px]" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            size="middle"
            className="w-60 [&_.ant-input-affix-wrapper]:rounded-md"
            style={{ borderRadius: 6, height: 32 }}
          />
          {/* .tb-divider */}
          <div className="w-px h-6 bg-slate-200 shrink-0" />
          {/* select.antd .w-44 */}
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="w-44 [&_.ant-select-selector]:!rounded-md [&_.ant-select-selector]:!h-8"
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
          <table className="w-full text-[14px]" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", minWidth: "2650px" }}>
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
                      // Mirrors .antd-table th from the mockup: normal-case 13.5px,
                      // grey header, hairline separator between columns.
                      "text-[13.5px] font-semibold text-slate-900 px-2 py-2 bg-[#fafafa]",
                      "border-b border-[#f0f0f0] whitespace-nowrap relative",
                      "after:content-[''] after:absolute after:right-0 after:top-1/4 after:h-1/2 after:w-px after:bg-[#f0f0f0]",
                      "last:after:hidden",
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
                  <tr key={s.id} className="[&:hover>td]:bg-[#fafafa] transition-colors">
                    {CUSTOMS_GRID.map((c, i) => {
                      if (c.recv) {
                        const on = recvValue(s, c.recv.field, c.recv.doc);
                        const auto = !((s[c.recv.field] as string | undefined) ?? "");
                        return (
                          <td key={i} className="px-2 py-1.5 border-b border-[#f0f0f0] text-center">
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

                      // Commercial Invoice Value shows the per-currency projection
                      // when the backend has one (civByCurrency in the mockup).
                      const value =
                        c.key === "commercialInvoiceValue"
                          ? getFieldValue(s, "civByCurrency") || getFieldValue(s, c.key!)
                          : getFieldValue(s, c.key!);
                      const style = getCellConditionalStyle(c.key!, value, rowData) ?? undefined;

                      if (c.ref) {
                        // Reference is coloured by department, like in the shipments list.
                        const refStyle = getCellConditionalStyle("jobNumber", value, rowData) ?? undefined;
                        return (
                          <td key={i} className="px-2 py-1.5 border-b border-[#f0f0f0] whitespace-nowrap overflow-hidden text-ellipsis">
                            <button
                              type="button"
                              onClick={() => setOpenId(s.id)}
                              className="font-mono text-[14px] font-bold hover:underline border-0 bg-transparent p-0 cursor-pointer"
                              style={refStyle ?? { color: "#4f46e5" }}
                            >
                              {value || "—"}
                            </button>
                          </td>
                        );
                      }

                      const isEditing = editing?.id === s.id && editing.key === c.key;
                      if (c.edit && isEditing) {
                        const options = COLUMN_MAP.get(c.key!)?.options;
                        return (
                          <td key={i} className="px-2 py-1 border-b border-[#f0f0f0]" style={style}>
                            {options ? (
                              <Select
                                size="small"
                                autoFocus
                                defaultOpen
                                value={draft || undefined}
                                options={[{ value: "", label: "—" }, ...options.map((o) => ({ value: o, label: o }))]}
                                onChange={(v) => setDraft(v)}
                                onBlur={commitEdit}
                                onSelect={(v) => {
                                  setDraft(v);
                                  setTimeout(commitEdit, 0);
                                }}
                                className="w-full"
                              />
                            ) : (
                              <Input
                                size="small"
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commitEdit}
                                onPressEnter={commitEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    committedRef.current = true;
                                    setEditing(null);
                                  }
                                }}
                              />
                            )}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={i}
                          className={[
                            "px-2 py-1.5 border-b border-[#f0f0f0] text-[14px]",
                            "whitespace-nowrap overflow-hidden text-ellipsis",
                            c.edit ? "cursor-pointer hover:bg-slate-100" : "",
                          ].join(" ")}
                          style={style}
                          onDoubleClick={c.edit ? () => startEdit(s, c.key!) : undefined}
                          title={c.edit ? "Double-click to edit" : undefined}
                        >
                          {value ? (
                            <span className="text-slate-600">{value}</span>
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
            <div className="px-3 py-7 text-center text-sm text-slate-400">
              No shipment matches the filter.
            </div>
          )}
        </div>
        {/* .tbl-foot from the mockup */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-[13px] text-slate-500">
          <span />
          <span>
            {rows.length} of {shipments.length} entries
          </span>
        </div>
      </div>
    </>
  );
}
