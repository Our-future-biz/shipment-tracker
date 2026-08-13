"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Button, AutoComplete, Select, Tag } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  DownOutlined,
  RightOutlined,
  ContainerOutlined,
  ColumnHeightOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import {
  PACK_TYPES,
  STACKABLE_OPTIONS,
  CURRENCIES,
  num,
  fmtNum,
  fmtFixed,
  dimensionVolumePerPiece,
  checkConsistency,
  civByCurrency,
  type CargoItemLine,
  type CargoDimensionLine,
  type ContainerLine,
} from "@/lib/cargo";

// Panel key: the container row id, or "none" for cargo that belongs to the
// shipment directly (no containers / LCL / air).
const NONE = "none";
const keyOf = (containerId: string | null | undefined) => containerId ?? NONE;

const emptyItem = (containerId: string | null): CargoItemLine => ({
  containerId,
  cargoDescription: "",
  hsCode: "",
  pieces: "",
  packageType: "",
  grossWeight: "",
  commercialInvoiceValue: "",
  currency: "USD",
});

const emptyDim = (containerId: string | null): CargoDimensionLine => ({
  containerId,
  pieces: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  weightPerPcKg: "",
  packageType: "",
  stackable: "",
});

const itemIsEmpty = (l: CargoItemLine) =>
  !l.cargoDescription && !l.hsCode && !l.pieces && !l.packageType && !l.grossWeight && !l.commercialInvoiceValue;
const dimIsEmpty = (l: CargoDimensionLine) =>
  !l.pieces && !l.lengthCm && !l.widthCm && !l.heightCm && !l.weightPerPcKg && !l.packageType && !l.stackable;

// Ensure every panel has at least one (local-only) row ready to type into.
function withPanelRows<T>(rows: T[], panelKeys: string[], keyFn: (r: T) => string, mk: (containerId: string | null) => T): T[] {
  const present = new Set(rows.map(keyFn));
  const missing = panelKeys.filter((k) => !present.has(k));
  return missing.length === 0 ? rows : [...rows, ...missing.map((k) => mk(k === NONE ? null : k))];
}

const packTypeOptions = (query: string) =>
  PACK_TYPES.filter((p) => p.toLowerCase().includes((query ?? "").toLowerCase().trim())).map((p) => ({ value: p }));

const currencyOptions = (query: string) => {
  const q = (query ?? "").toLowerCase().trim();
  return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).map((c) => ({
    value: c.code,
    label: (
      <span>
        {c.code} <span className="text-slate-400 text-xs">{c.name}</span>
      </span>
    ),
  }));
};

const DIM_COLS = "grid grid-cols-[0.6fr_0.7fr_0.7fr_0.7fr_0.9fr_0.9fr_1fr_1.1fr_32px] gap-1.5 items-center";
const DESC_COLS = "grid grid-cols-[1.8fr_0.9fr_0.6fr_1fr_0.9fr_1fr_0.75fr_32px] gap-1.5 items-center";

export function CargoDetailsTab({
  shipment,
  onChange,
  focusContainerId,
}: {
  shipment: ShipmentItem;
  onChange: (data: { cargoItems?: CargoItemLine[]; cargoDimensions?: CargoDimensionLine[] }) => void;
  focusContainerId?: string | null;
}) {
  // Containers that made it to the server (they have ids cargo lines can point
  // at). A row still being typed in the Container tab gets its panel after its
  // first save round-trips.
  const containers = useMemo(
    () => (shipment.containers ?? []).filter((c): c is ContainerLine & { id: string } => !!c.id),
    [shipment.containers],
  );

  const [items, setItems] = useState<CargoItemLine[]>(() => shipment.cargoItems ?? []);
  const [dims, setDims] = useState<CargoDimensionLine[]>(() => shipment.cargoDimensions ?? []);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const itemsRef = useRef(items);
  const dimsRef = useRef(dims);
  itemsRef.current = items;
  dimsRef.current = dims;
  const panelRefs = useRef(new Map<string, HTMLDivElement>());

  // Reset local edit state when navigating to a different shipment.
  useEffect(() => {
    setItems(shipment.cargoItems ?? []);
    setDims(shipment.cargoDimensions ?? []);
    setCollapsed(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.id]);

  // One panel per container; the shipment-level panel shows when there are no
  // containers, or when containerless lines exist (e.g. LCL cargo).
  const panelKeys = useMemo(() => {
    const keys = containers.map((c) => c.id);
    const hasLoose = items.some((l) => !l.containerId) || dims.some((l) => !l.containerId);
    if (keys.length === 0 || hasLoose) keys.push(NONE);
    return keys;
  }, [containers, items, dims]);

  // Seed each panel with an empty line to type into (kept local until edited —
  // empty lines are filtered out of every save).
  useEffect(() => {
    setItems((prev) => withPanelRows(prev, panelKeys, (l) => keyOf(l.containerId), emptyItem));
    setDims((prev) => withPanelRows(prev, panelKeys, (l) => keyOf(l.containerId), emptyDim));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelKeys.join("|")]);

  // Jumping in from the Container tab: expand that panel, collapse the rest,
  // scroll to it and flash it briefly.
  useEffect(() => {
    if (!focusContainerId) return;
    setCollapsed(new Set(panelKeys.filter((k) => k !== focusContainerId)));
    setFlash(focusContainerId);
    panelRefs.current.get(focusContainerId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusContainerId]);

  const persistItems = () => onChange({ cargoItems: itemsRef.current.filter((l) => !itemIsEmpty(l)) });
  const persistDims = () => onChange({ cargoDimensions: dimsRef.current.filter((l) => !dimIsEmpty(l)) });

  const patchItem = (idx: number, p: Partial<CargoItemLine>) =>
    setItems((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));
  const patchDim = (idx: number, p: Partial<CargoDimensionLine>) =>
    setDims((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));

  const addItem = (panelKey: string) =>
    setItems((r) => [...r, emptyItem(panelKey === NONE ? null : panelKey)]);
  const addDim = (panelKey: string) =>
    setDims((r) => [...r, emptyDim(panelKey === NONE ? null : panelKey)]);

  // Removing a panel's last line just clears it (reference-UI behavior).
  const removeItem = (idx: number, panelSize: number) => {
    const next =
      panelSize > 1
        ? itemsRef.current.filter((_, j) => j !== idx)
        : itemsRef.current.map((l, j) => (j === idx ? emptyItem(l.containerId ?? null) : l));
    setItems(next);
    onChange({ cargoItems: next.filter((l) => !itemIsEmpty(l)) });
  };
  const removeDim = (idx: number, panelSize: number) => {
    const next =
      panelSize > 1
        ? dimsRef.current.filter((_, j) => j !== idx)
        : dimsRef.current.map((l, j) => (j === idx ? emptyDim(l.containerId ?? null) : l));
    setDims(next);
    onChange({ cargoDimensions: next.filter((l) => !dimIsEmpty(l)) });
  };

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      {panelKeys.map((key) => {
        const container = containers.find((c) => c.id === key) ?? null;
        const panelItems = items.map((l, idx) => ({ l, idx })).filter(({ l }) => keyOf(l.containerId) === key);
        const panelDims = dims.map((l, idx) => ({ l, idx })).filter(({ l }) => keyOf(l.containerId) === key);
        const check = container ? checkConsistency(container, panelDims.map(({ l }) => l)) : null;
        const isCollapsed = collapsed.has(key);

        const containerIndex = container ? containers.indexOf(container) : -1;
        const title = container
          ? container.containerNumber
            ? `Container number: ${container.containerNumber}`
            : `Container #${containerIndex + 1}`
          : "Shipment cargo (no container)";

        const descTotalPcs = panelItems.reduce((s, { l }) => s + num(l.pieces), 0);
        const descTotalGw = panelItems.reduce((s, { l }) => s + num(l.grossWeight), 0);
        const descCiv = civByCurrency(panelItems.map(({ l }) => l));

        // "TOTAL: sum / declared" cells — green when the declaration matches the
        // dimension sums, red when it doesn't, plain when both sides are empty.
        const totalCell = (m: { sum: number; declared: number; empty: boolean; ok: boolean } | null, sum: number, unit: string, decimals: number) => {
          const f = (v: number) => (decimals === 0 ? fmtNum(v) : fmtFixed(v, decimals));
          if (!m || m.empty) {
            return <span className="text-slate-500">TOTAL: {f(m ? 0 : sum)} {unit}</span>;
          }
          return (
            <span className={m.ok ? "text-emerald-600" : "text-red-600"}>
              TOTAL: {f(m.sum)} / {f(m.declared)} {unit}
            </span>
          );
        };
        const dimTotals = {
          pcs: panelDims.reduce((s, { l }) => s + num(l.pieces), 0),
          kg: panelDims.reduce((s, { l }) => s + num(l.pieces) * num(l.weightPerPcKg), 0),
          m3: panelDims.reduce((s, { l }) => s + num(l.pieces) * dimensionVolumePerPiece(l), 0),
        };

        return (
          <div
            key={key}
            ref={(el) => {
              if (el) panelRefs.current.set(key, el);
              else panelRefs.current.delete(key);
            }}
            className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6 transition-shadow ${
              flash === key ? "ring-[3px] ring-indigo-300" : ""
            }`}
          >
            {/* Panel header: title + Matched/Mismatch badge; click collapses/expands */}
            <div
              className="flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 px-5 py-3 cursor-pointer select-none"
              onClick={() => toggle(key)}
            >
              <ContainerOutlined className="text-indigo-500 text-base" />
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">{title}</h3>
              {check && (
                <Tag color={check.matched ? "green" : "red"} className="!ml-2 font-semibold">
                  {check.matched ? "✓ Matched" : "⚠ Mismatch"}
                </Tag>
              )}
              <span className="ml-auto text-slate-400 text-xs">{isCollapsed ? <RightOutlined /> : <DownOutlined />}</span>
            </div>

            {!isCollapsed && (
              <div className="p-4 flex flex-col gap-4">
                {/* ── Cargo Dimensions ── */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2.5 bg-indigo-50/60 border-b border-slate-200 px-4 py-2">
                    <ColumnHeightOutlined className="text-indigo-500 text-sm" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider m-0 flex-1">Cargo Dimensions</h4>
                    <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => addDim(key)}>
                      Add
                    </Button>
                  </div>
                  <div className="p-3">
                    <div className="overflow-x-auto">
                      <div className="min-w-[860px]">
                        <div className={`${DIM_COLS} px-1 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
                          <span className="text-right">Pieces (PCS)</span>
                          <span className="text-right">Length (cm)</span>
                          <span className="text-right">Width (cm)</span>
                          <span className="text-right">Height (cm)</span>
                          <span className="text-right">Gross Weight / PC (kg)</span>
                          <span className="text-right">Volume / PC (m³)</span>
                          <span>Type of Packages</span>
                          <span>Stackable/Overstow.</span>
                          <span />
                        </div>

                        {panelDims.map(({ l, idx }) => {
                          const vpc = dimensionVolumePerPiece(l);
                          return (
                            <div key={idx} className={`${DIM_COLS} px-1 py-1 border-b border-slate-100`}>
                              <Input size="small" className="text-right" value={l.pieces} onChange={(e) => patchDim(idx, { pieces: e.target.value })} onBlur={persistDims} />
                              <Input size="small" className="text-right" value={l.lengthCm} onChange={(e) => patchDim(idx, { lengthCm: e.target.value })} onBlur={persistDims} />
                              <Input size="small" className="text-right" value={l.widthCm} onChange={(e) => patchDim(idx, { widthCm: e.target.value })} onBlur={persistDims} />
                              <Input size="small" className="text-right" value={l.heightCm} onChange={(e) => patchDim(idx, { heightCm: e.target.value })} onBlur={persistDims} />
                              <Input size="small" className="text-right" value={l.weightPerPcKg} onChange={(e) => patchDim(idx, { weightPerPcKg: e.target.value })} onBlur={persistDims} />
                              <Input size="small" className="text-right !bg-slate-50 !text-slate-500" readOnly tabIndex={-1} value={vpc ? vpc.toFixed(3) : ""} />
                              <Select
                                size="small"
                                className="w-full"
                                value={l.packageType || undefined}
                                allowClear
                                placeholder="—"
                                options={PACK_TYPES.map((p) => ({ value: p }))}
                                onChange={(v) => {
                                  patchDim(idx, { packageType: v ?? "" });
                                  setTimeout(persistDims, 0);
                                }}
                              />
                              <Select
                                size="small"
                                className="w-full"
                                value={l.stackable || undefined}
                                allowClear
                                placeholder="—"
                                options={STACKABLE_OPTIONS.map((s) => ({ value: s }))}
                                onChange={(v) => {
                                  patchDim(idx, { stackable: v ?? "" });
                                  setTimeout(persistDims, 0);
                                }}
                              />
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeDim(idx, panelDims.length)} />
                            </div>
                          );
                        })}

                        <div className={`${DIM_COLS} px-1 pt-2 text-xs font-extrabold uppercase tracking-wide`}>
                          <span className="text-right whitespace-nowrap col-span-1">{totalCell(check?.pcs ?? null, dimTotals.pcs, "PCS", 0)}</span>
                          <span />
                          <span />
                          <span />
                          <span className="text-right whitespace-nowrap">{totalCell(check?.kg ?? null, dimTotals.kg, "KG", 2)}</span>
                          <span className="text-right whitespace-nowrap">{totalCell(check?.m3 ?? null, dimTotals.m3, "M³", 3)}</span>
                          <span className="col-span-3" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Cargo Description ── */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2.5 bg-indigo-50/60 border-b border-slate-200 px-4 py-2">
                    <FileTextOutlined className="text-indigo-500 text-sm" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider m-0 flex-1">Cargo Description</h4>
                    <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => addItem(key)}>
                      Add
                    </Button>
                  </div>
                  <div className="p-3">
                    <div className="overflow-x-auto">
                      <div className="min-w-[860px]">
                        <div className={`${DESC_COLS} px-1 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
                          <span>Cargo Description</span>
                          <span>HS Code</span>
                          <span className="text-right">Pieces (PCS)</span>
                          <span>Type of Packages</span>
                          <span className="text-right">Gross Weight (kg)</span>
                          <span className="text-right">Commercial Invoice Value</span>
                          <span>Currency</span>
                          <span />
                        </div>

                        {panelItems.map(({ l, idx }) => (
                          <div key={idx} className={`${DESC_COLS} px-1 py-1 border-b border-slate-100`}>
                            <Input size="small" value={l.cargoDescription} placeholder="PLASTIC PARTS OF SPEAKER" onChange={(e) => patchItem(idx, { cargoDescription: e.target.value })} onBlur={persistItems} />
                            <Input size="small" value={l.hsCode} placeholder="85319000" onChange={(e) => patchItem(idx, { hsCode: e.target.value })} onBlur={persistItems} />
                            <Input size="small" className="text-right" value={l.pieces} onChange={(e) => patchItem(idx, { pieces: e.target.value })} onBlur={persistItems} />
                            <AutoComplete
                              size="small"
                              className="w-full"
                              value={l.packageType}
                              placeholder="Pallet(s)"
                              options={packTypeOptions(l.packageType)}
                              onChange={(v) => patchItem(idx, { packageType: v })}
                              onBlur={persistItems}
                            />
                            <Input size="small" className="text-right" value={l.grossWeight} onChange={(e) => patchItem(idx, { grossWeight: e.target.value })} onBlur={persistItems} />
                            <Input size="small" className="text-right" value={l.commercialInvoiceValue} placeholder="12 500" onChange={(e) => patchItem(idx, { commercialInvoiceValue: e.target.value })} onBlur={persistItems} />
                            <AutoComplete
                              size="small"
                              className="w-full"
                              value={l.currency}
                              placeholder="USD"
                              options={currencyOptions(l.currency)}
                              onChange={(v) => patchItem(idx, { currency: (v ?? "").toUpperCase() })}
                              onBlur={persistItems}
                            />
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(idx, panelItems.length)} />
                          </div>
                        ))}

                        {/* Informative totals — no comparison, no status color */}
                        <div className={`${DESC_COLS} px-1 pt-2 text-xs font-bold text-slate-700 uppercase tracking-wide`}>
                          <span className="text-[11px] text-slate-500">Total</span>
                          <span />
                          <span className={`text-right ${descTotalPcs ? "" : "text-slate-300"}`}>{descTotalPcs ? fmtNum(descTotalPcs) : "—"}</span>
                          <span />
                          <span className={`text-right ${descTotalGw ? "" : "text-slate-300"}`}>{descTotalGw ? fmtNum(descTotalGw) : "—"}</span>
                          <span className={`text-right whitespace-nowrap ${descCiv ? "" : "text-slate-300"}`}>{descCiv || "—"}</span>
                          <span className="col-span-2" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
