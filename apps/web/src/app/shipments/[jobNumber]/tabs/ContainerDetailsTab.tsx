"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Button } from "antd";
import { PlusOutlined, DeleteOutlined, ContainerOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { interfaces } from "@/lib/api/client";
import { normalizeContainerNumber } from "@/lib/container";

type ContainerLine = interfaces.ContainerLine;

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

const num = (s: string) => {
  const n = parseFloat((s || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) =>
  (Number.isInteger(n) ? n.toString() : n.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const COLS = "grid grid-cols-[1.4fr_1.1fr_0.9fr_0.55fr_0.7fr_1fr_1fr_0.9fr_36px] gap-2 items-center";

export function ContainerDetailsTab({
  shipment,
  onChange,
}: {
  shipment: ShipmentItem;
  onChange: (containers: ContainerLine[]) => void;
}) {
  const [rows, setRows] = useState<ContainerLine[]>(() => withFirstRow(shipment.containers));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Reset local edit state when navigating to a different shipment.
  useEffect(() => {
    setRows(withFirstRow(shipment.containers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.id]);

  const persist = () => onChange(rowsRef.current);
  const patch = (i: number, p: Partial<ContainerLine>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...p } : c)));
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
    onChange(next);
  };
  const remove = (i: number) => {
    const next = rowsRef.current.filter((_, j) => j !== i);
    setRows(next);
    onChange(next);
  };

  const totalTeu = rows.reduce((s, c) => s + num(c.teu), 0);
  const totalPackages = rows.reduce((s, c) => s + num(c.packages), 0);
  const totalWeight = rows.reduce((s, c) => s + num(c.grossWeight), 0);
  const totalVolume = rows.reduce((s, c) => s + num(c.volume), 0);

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
        {rows.length === 0 ? (
          <div className="text-center text-slate-300 italic py-10 text-sm">No containers added yet</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className={`${COLS} px-2 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
                <span>Container Number</span>
                <span>Seal Number</span>
                <span>Type</span>
                <span className="text-right">TEU</span>
                <span className="text-right">Packages</span>
                <span>Type of Packages</span>
                <span className="text-right">Gross Weight (kg)</span>
                <span className="text-right">Volume (m³)</span>
                <span />
              </div>

              {rows.map((c, i) => (
                <div key={i} className={`${COLS} px-2 py-1.5 border-b border-slate-100`}>
                  <Input size="small" value={c.containerNumber} placeholder="MSKU1234567" onChange={(e) => patch(i, { containerNumber: e.target.value })} onBlur={() => normalizeContainerAt(i)} />
                  <Input size="small" value={c.sealNumber} onChange={(e) => patch(i, { sealNumber: e.target.value })} onBlur={persist} />
                  <Input size="small" value={c.type} placeholder="40' HC" onChange={(e) => patch(i, { type: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.teu} onChange={(e) => patch(i, { teu: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.packages} onChange={(e) => patch(i, { packages: e.target.value })} onBlur={persist} />
                  <Input size="small" value={c.packageType} placeholder="Pallets" onChange={(e) => patch(i, { packageType: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.grossWeight} onChange={(e) => patch(i, { grossWeight: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.volume} onChange={(e) => patch(i, { volume: e.target.value })} onBlur={persist} />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
                </div>
              ))}

              <div className={`${COLS} px-2 pt-3 mt-1 text-xs font-bold text-slate-800 border-t-2 border-slate-200`}>
                <span className="uppercase tracking-wide text-[11px]">Total · {rows.length} container{rows.length === 1 ? "" : "s"}</span>
                <span />
                <span />
                <span className="text-right">{fmt(totalTeu)}</span>
                <span className="text-right">{fmt(totalPackages)}</span>
                <span />
                <span className="text-right">{fmt(totalWeight)}</span>
                <span className="text-right">{fmt(totalVolume)}</span>
                <span />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
