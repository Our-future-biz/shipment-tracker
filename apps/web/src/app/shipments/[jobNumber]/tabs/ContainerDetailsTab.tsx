"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Button, AutoComplete } from "antd";
import { PlusOutlined, DeleteOutlined, ContainerOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import { normalizeContainerNumber } from "@/lib/container";
import {
  CONTAINER_SIZES,
  CONTAINER_KINDS,
  PACK_TYPES,
  teuForType,
  num,
  fmtNum,
  type ContainerLine,
} from "@/lib/cargo";

const emptyContainer = (): ContainerLine => ({
  containerNumber: "",
  sealNumber: "",
  type: "",
  teu: "",
  packages: "",
  packageType: "",
  grossWeight: "",
  volume: "",
});

// Show one empty row from the start so a new shipment has a ready-to-fill form
// (no "Add container" click needed for the first). It stays local until edited,
// so an untouched row is never persisted.
const withFirstRow = (list: ContainerLine[] | null | undefined): ContainerLine[] =>
  list && list.length > 0 ? list : [emptyContainer()];

// Grouped "20' GP … 40' FR" options, filtered the way the reference UI does:
// compare with apostrophes/spaces stripped, and "2"/"20"/"4"/"40" narrows to
// that size group.
function containerTypeOptions(query: string) {
  const q = query.toLowerCase().replace(/['’\s]/g, "");
  return CONTAINER_SIZES.map((size) => {
    const sizeKey = size.replace("'", "");
    const options = CONTAINER_KINDS.map((k) => `${size} ${k}`).filter((o) =>
      o.toLowerCase().replace(/['’\s]/g, "").includes(q),
    );
    if (q && ["2", "20", "4", "40"].includes(q) && !sizeKey.startsWith(q)) return null;
    if (options.length === 0) return null;
    return {
      label: `${size} containers · ${teuForType(size)} TEU`,
      options: options.map((o) => ({ value: o, label: o })),
    };
  }).filter((g): g is NonNullable<typeof g> => g !== null);
}

const packTypeOptions = (query: string) =>
  PACK_TYPES.filter((p) => p.toLowerCase().includes(query.toLowerCase().trim())).map((p) => ({ value: p }));

const FIELDS = ["containerNumber", "sealNumber", "type", "packages", "packageType", "grossWeight", "volume"] as const;
type Field = (typeof FIELDS)[number];

const COLS = "grid grid-cols-[1.4fr_1.1fr_1fr_0.7fr_1.1fr_1fr_0.9fr_36px] gap-2 items-center";

export function ContainerDetailsTab({
  shipment,
  onChange,
  onOpenCargo,
}: {
  shipment: ShipmentItem;
  onChange: (containers: ContainerLine[]) => void;
  onOpenCargo?: (containerId: string) => void;
}) {
  const [rows, setRows] = useState<ContainerLine[]>(() => withFirstRow(shipment.containers));
  // Rows being edited. Rows without a container number are always editable; a row
  // with one collapses to read mode on Enter / focus leaving the row, and
  // double-click re-opens it (reference-UI behavior).
  const [editing, setEditing] = useState<Set<number>>(() => new Set());
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // antd Input and AutoComplete expose different ref classes; all we need from
  // either is focus().
  const inputRefs = useRef(new Map<string, { focus: () => void }>());
  const focusAfterRender = useRef<string | null>(null);

  // Reset local edit state when navigating to a different shipment.
  useEffect(() => {
    setRows(withFirstRow(shipment.containers));
    setEditing(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.id]);

  // After a save round-trips, the server response carries the container row ids.
  // Merge them into rows that don't have one yet (same order as we sent), so the
  // next save updates rows in place instead of recreating them — cargo lines
  // reference these ids.
  useEffect(() => {
    const server = shipment.containers ?? [];
    setRows((local) =>
      local.map((r, i) => (r.id || !server[i]?.id ? r : { ...r, id: server[i].id })),
    );
  }, [shipment.containers]);

  useEffect(() => {
    if (focusAfterRender.current) {
      const el = inputRefs.current.get(focusAfterRender.current);
      focusAfterRender.current = null;
      el?.focus();
    }
  });

  const persist = () => onChange(rowsRef.current);
  const patch = (i: number, p: Partial<ContainerLine>) =>
    setRows((r) => r.map((c, j) => (j === i ? { ...c, ...p } : c)));
  // On blur, collapse the container number to its canonical form (no spaces/hyphens, uppercase).
  const normalizeContainerAt = (i: number) => {
    const next = rowsRef.current.map((r, j) =>
      j === i ? { ...r, containerNumber: normalizeContainerNumber(r.containerNumber) } : r,
    );
    setRows(next);
    onChange(next);
  };
  const add = () => {
    const next = [...rowsRef.current, emptyContainer()];
    setRows(next);
    setEditing((e) => new Set(e).add(next.length - 1));
    focusAfterRender.current = `${next.length - 1}:containerNumber`;
    onChange(next);
  };
  // Deleting the last remaining row just clears it (reference-UI behavior); the
  // backend cascades the removed container's cargo lines.
  const remove = (i: number) => {
    const filtered = rowsRef.current.filter((_, j) => j !== i);
    const next = filtered.length > 0 ? filtered : [emptyContainer()];
    setRows(next);
    setEditing(new Set());
    onChange(filtered);
  };

  const isEditing = (i: number) => editing.has(i) || !(rows[i]?.containerNumber ?? "").trim();
  const closeRow = (i: number) =>
    setEditing((e) => {
      if (!e.has(i)) return e;
      const next = new Set(e);
      next.delete(i);
      return next;
    });
  const openRow = (i: number, field: Field) => {
    setEditing((e) => new Set(e).add(i));
    focusAfterRender.current = `${i}:${field}`;
  };

  // Focus leaving the row switches it to read mode (like clicking outside in the
  // reference UI). relatedTarget is null while antd moves focus into its dropdown,
  // so only close when focus really landed outside the row.
  const onRowBlur = (i: number) => (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (e.relatedTarget) closeRow(i);
  };
  const onRowKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    (e.target as HTMLElement).blur?.();
    persist();
    closeRow(i);
  };

  const setInputRef = (key: string) => (el: { focus: () => void } | null) => {
    if (el) inputRefs.current.set(key, el);
    else inputRefs.current.delete(key);
  };

  const totalPackages = rows.reduce((s, c) => s + num(c.packages), 0);
  const totalWeight = rows.reduce((s, c) => s + num(c.grossWeight), 0);
  const totalVolume = rows.reduce((s, c) => s + num(c.volume), 0);

  const [typeQuery, setTypeQuery] = useState("");
  const typeOptions = useMemo(() => containerTypeOptions(typeQuery), [typeQuery]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 px-5 py-3">
        <ContainerOutlined className="text-indigo-500 text-base" />
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0 flex-1">Container Details</h3>
        <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={add}>
          Add container
        </Button>
      </div>

      <div className="p-4">
        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className={`${COLS} px-2 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
              <span>Container Number</span>
              <span>Seal Number</span>
              <span>Container Type</span>
              <span className="text-right">Pieces (PCS)</span>
              <span>Type of Packages</span>
              <span className="text-right">Gross Weight (kg)</span>
              <span className="text-right">Volume (m³)</span>
              <span />
            </div>

            {rows.map((c, i) =>
              isEditing(i) ? (
                <div
                  key={i}
                  className={`${COLS} px-2 py-1.5 border-b border-slate-100`}
                  onBlur={onRowBlur(i)}
                  onKeyDown={onRowKeyDown(i)}
                >
                  <Input
                    ref={setInputRef(`${i}:containerNumber`)}
                    size="small"
                    value={c.containerNumber}
                    placeholder="MSKU1234567"
                    onChange={(e) => patch(i, { containerNumber: e.target.value })}
                    onBlur={() => normalizeContainerAt(i)}
                  />
                  <Input
                    ref={setInputRef(`${i}:sealNumber`)}
                    size="small"
                    value={c.sealNumber}
                    onChange={(e) => patch(i, { sealNumber: e.target.value })}
                    onBlur={persist}
                  />
                  <AutoComplete
                    ref={setInputRef(`${i}:type`)}
                    size="small"
                    value={c.type}
                    placeholder="Select..."
                    options={typeOptions}
                    onFocus={() => setTypeQuery(c.type)}
                    onSearch={setTypeQuery}
                    onChange={(v) => patch(i, { type: v })}
                    onBlur={persist}
                    className="w-full"
                  />
                  <Input
                    ref={setInputRef(`${i}:packages`)}
                    size="small"
                    className="text-right"
                    value={c.packages}
                    onChange={(e) => patch(i, { packages: e.target.value })}
                    onBlur={persist}
                  />
                  <AutoComplete
                    ref={setInputRef(`${i}:packageType`)}
                    size="small"
                    value={c.packageType}
                    placeholder="Pallet(s)"
                    options={packTypeOptions(c.packageType)}
                    onChange={(v) => patch(i, { packageType: v })}
                    onBlur={persist}
                    className="w-full"
                  />
                  <Input
                    ref={setInputRef(`${i}:grossWeight`)}
                    size="small"
                    className="text-right"
                    value={c.grossWeight}
                    onChange={(e) => patch(i, { grossWeight: e.target.value })}
                    onBlur={persist}
                  />
                  <Input
                    ref={setInputRef(`${i}:volume`)}
                    size="small"
                    className="text-right"
                    value={c.volume}
                    onChange={(e) => patch(i, { volume: e.target.value })}
                    onBlur={persist}
                  />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
                </div>
              ) : (
                // Read mode: double-click anywhere re-opens editing focused on the
                // clicked column; the container number is a link to its cargo panel.
                <div
                  key={i}
                  className={`${COLS} px-2 py-1.5 border-b border-slate-100 cursor-pointer hover:bg-slate-50 select-none`}
                  onDoubleClick={(e) => {
                    const field = (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field as
                      | Field
                      | undefined;
                    openRow(i, field ?? "containerNumber");
                  }}
                >
                  <span data-field="containerNumber">
                    <button
                      type="button"
                      className={`font-mono font-bold text-[13px] tracking-wide px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 ${
                        c.id && onOpenCargo ? "hover:bg-indigo-100 hover:text-indigo-700 cursor-pointer" : "cursor-default"
                      }`}
                      title="Open Cargo Details"
                      onClick={() => c.id && onOpenCargo?.(c.id)}
                    >
                      {c.containerNumber}
                    </button>
                  </span>
                  <span data-field="sealNumber" className="text-sm text-slate-700 px-2 truncate">{c.sealNumber}</span>
                  <span data-field="type" className="text-sm text-slate-700 px-2">{c.type}</span>
                  <span data-field="packages" className="text-sm text-slate-700 px-2 text-right">{c.packages}</span>
                  <span data-field="packageType" className="text-sm text-slate-700 px-2 truncate">{c.packageType}</span>
                  <span data-field="grossWeight" className="text-sm text-slate-700 px-2 text-right">{c.grossWeight}</span>
                  <span data-field="volume" className="text-sm text-slate-700 px-2 text-right">{c.volume}</span>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
                </div>
              ),
            )}

            <div className={`${COLS} px-2 pt-3 mt-1 text-xs font-bold text-slate-800 border-t-2 border-slate-200`}>
              <span className="uppercase tracking-wide text-[11px]">
                Total · {rows.length} container{rows.length === 1 ? "" : "s"}
              </span>
              <span />
              <span />
              <span className="text-right">{fmtNum(totalPackages)}</span>
              <span />
              <span className="text-right">{fmtNum(totalWeight)}</span>
              <span className="text-right">{fmtNum(totalVolume)}</span>
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
