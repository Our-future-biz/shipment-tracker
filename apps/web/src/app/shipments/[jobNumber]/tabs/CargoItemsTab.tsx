"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Button } from "antd";
import { PlusOutlined, DeleteOutlined, CodeSandboxOutlined } from "@ant-design/icons";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { interfaces } from "@/lib/api/client";

type CargoItemLine = interfaces.CargoItemLine;

const emptyCargoItem = (): CargoItemLine => ({
  cargoDescription: "",
  hsCode: "",
  pieces: "",
  packageType: "",
  grossWeight: "",
  volume: "",
  commercialInvoiceValue: "",
});

// Show one empty row from the start so a new shipment has a ready-to-fill form
// (no "Add cargo item" click needed for the first). It stays local until edited,
// so an untouched row is never persisted.
const withFirstRow = (list: CargoItemLine[] | null | undefined): CargoItemLine[] =>
  list && list.length > 0 ? list : [emptyCargoItem()];

const num = (s: string) => {
  const n = parseFloat((s || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) =>
  (Number.isInteger(n) ? n.toString() : n.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const COLS = "grid grid-cols-[1.8fr_0.9fr_0.6fr_1fr_0.9fr_0.7fr_1.1fr_36px] gap-2 items-center";

export function CargoItemsTab({
  shipment,
  onChange,
}: {
  shipment: ShipmentItem;
  onChange: (cargoItems: CargoItemLine[]) => void;
}) {
  const [rows, setRows] = useState<CargoItemLine[]>(() => withFirstRow(shipment.cargoItems));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Reset local edit state when navigating to a different shipment.
  useEffect(() => {
    setRows(withFirstRow(shipment.cargoItems));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.id]);

  const persist = () => onChange(rowsRef.current);
  const patch = (i: number, p: Partial<CargoItemLine>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const add = () => {
    const next = [...rowsRef.current, emptyCargoItem()];
    setRows(next);
    onChange(next);
  };
  const remove = (i: number) => {
    const next = rowsRef.current.filter((_, j) => j !== i);
    setRows(next);
    onChange(next);
  };

  const totalPieces = rows.reduce((s, c) => s + num(c.pieces), 0);
  const totalWeight = rows.reduce((s, c) => s + num(c.grossWeight), 0);
  const totalVolume = rows.reduce((s, c) => s + num(c.volume), 0);
  const totalInvoice = rows.reduce((s, c) => s + num(c.commercialInvoiceValue), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 px-5 py-3">
        <CodeSandboxOutlined className="text-indigo-500 text-base" />
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0 flex-1">Cargo Details</h3>
        <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={add}>
          Add cargo item
        </Button>
      </div>

      <div className="p-4">
        {rows.length === 0 ? (
          <div className="text-center text-slate-300 italic py-10 text-sm">No cargo items added yet</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className={`${COLS} px-2 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
                <span>Cargo Description</span>
                <span>HS Code</span>
                <span className="text-right">Pieces (PCS)</span>
                <span>Type of Packages</span>
                <span className="text-right">Gross Weight (kg)</span>
                <span className="text-right">Volume (m³)</span>
                <span className="text-right">Commercial Invoice Value</span>
                <span />
              </div>

              {rows.map((c, i) => (
                <div key={i} className={`${COLS} px-2 py-1.5 border-b border-slate-100`}>
                  <Input size="small" value={c.cargoDescription} placeholder="PLASTIC PARTS OF SPEAKER" onChange={(e) => patch(i, { cargoDescription: e.target.value })} onBlur={persist} />
                  <Input size="small" value={c.hsCode} placeholder="85319000" onChange={(e) => patch(i, { hsCode: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.pieces} onChange={(e) => patch(i, { pieces: e.target.value })} onBlur={persist} />
                  <Input size="small" value={c.packageType} placeholder="Cartons" onChange={(e) => patch(i, { packageType: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.grossWeight} onChange={(e) => patch(i, { grossWeight: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.volume} onChange={(e) => patch(i, { volume: e.target.value })} onBlur={persist} />
                  <Input size="small" className="text-right" value={c.commercialInvoiceValue} placeholder="12 500 USD" onChange={(e) => patch(i, { commercialInvoiceValue: e.target.value })} onBlur={persist} />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
                </div>
              ))}

              <div className={`${COLS} px-2 pt-3 mt-1 text-xs font-bold text-slate-800 border-t-2 border-slate-200`}>
                <span className="uppercase tracking-wide text-[11px]">Total · {rows.length} item{rows.length === 1 ? "" : "s"}</span>
                <span />
                <span className="text-right">{fmt(totalPieces)}</span>
                <span />
                <span className="text-right">{fmt(totalWeight)}</span>
                <span className="text-right">{fmt(totalVolume)}</span>
                <span className="text-right">{fmt(totalInvoice)}</span>
                <span />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
