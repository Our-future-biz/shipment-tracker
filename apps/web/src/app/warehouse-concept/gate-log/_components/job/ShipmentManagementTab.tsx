"use client";

import { useState, type ReactNode } from "react";
import { Button } from "antd";
import { ApartmentOutlined, PlusOutlined } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import type { controllers, interfaces } from "@/lib/api/client";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { MAX_DROPS, PACKINGS } from "../../_lib/gate";
import { Section } from "./fields";

type Drop = interfaces.GateSubPosition;
type Save = (data: Omit<controllers.GateMovementUpdateRequest, "id">) => void;
type NumKey = "qty" | "width" | "length" | "height" | "weight" | "measure" | "totalGross" | "storageDays";
type TextKey = "description" | "plate" | "driver" | "transport";

// Column widths as Tailwind classes (a fixed table layout reads them from the <col>s).
const COLUMNS: { title: string; width: string }[] = [
  { title: "Sub-position", width: "w-[128px]" },
  { title: "ETW", width: "w-[132px]" },
  { title: TERMS.pieces, width: "w-[80px]" },
  { title: "Packing", width: "w-[118px]" },
  { title: "Width", width: "w-[86px]" },
  { title: "Length", width: "w-[86px]" },
  { title: "Height", width: "w-[86px]" },
  { title: "Description", width: "w-[190px]" },
  { title: TERMS.weightKg, width: "w-[92px]" },
  { title: TERMS.volumeCbm, width: "w-[104px]" },
  { title: "Total gross", width: "w-[104px]" },
  { title: TERMS.plate, width: "w-[112px]" },
  { title: TERMS.driver, width: "w-[128px]" },
  { title: "Transport", width: "w-[150px]" },
  { title: "VGM", width: "w-[58px]" },
  { title: "VGM date", width: "w-[132px]" },
  { title: "Storage (days)", width: "w-[110px]" },
  { title: "", width: "w-[44px]" },
];
/** All columns together (1940px): the table scrolls sideways below that. */
const TABLE_MIN_WIDTH = "min-w-[1940px]";

const blankDrop = (): Drop => ({
  etw: "",
  qty: null,
  packing: "",
  width: null,
  length: null,
  height: null,
  description: "",
  weight: null,
  measure: null,
  totalGross: null,
  plate: "",
  driver: "",
  transport: "",
  vgm: false,
  vgmDate: "",
  storageDays: null,
});

const cell =
  "w-full min-w-0 bg-transparent border border-transparent rounded px-1.5 py-1 text-xs font-medium text-slate-900 outline-none hover:bg-slate-50 focus:bg-white focus:border-slate-300 placeholder:text-slate-300 placeholder:font-normal disabled:opacity-40 disabled:cursor-not-allowed";
const numCell = `${cell} font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

const fmt = (v: number, unit: string) => (v ? `${v.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} ${unit}` : "0");

const Total = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-xs">
    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
    <span className="font-mono font-semibold text-slate-900">{children}</span>
  </span>
);

// Sub-positions: one container delivered in up to ten drops, numbered <base>-1, -2 …
// Cells save when they lose focus (selects, dates and the VGM tick save straight away).
export function ShipmentManagementTab({ m, save }: { m: GateMovement; save: Save }) {
  const [rows, setRows] = useState<Drop[]>(m.subPositions);
  const base = m.positionRef || m.gateRef;

  const persist = (next: Drop[]) => {
    setRows(next);
    save({ subPositions: next });
  };
  const edit = (i: number, patch: Partial<Drop>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const commit = () => save({ subPositions: rows });
  const change = (i: number, patch: Partial<Drop>) => persist(rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const sum = (key: NumKey) => rows.reduce((a, r) => a + (r[key] ?? 0), 0);
  const qty = sum("qty");
  const weight = sum("weight");
  const measure = sum("measure");
  const gross = sum("totalGross");
  const full = rows.length >= MAX_DROPS;

  const num = (i: number, key: NumKey, placeholder: string, step = 1) => (
    <input
      className={numCell}
      type="number"
      min={0}
      step={step}
      placeholder={placeholder}
      value={rows[i]![key] ?? ""}
      onChange={(e) => edit(i, { [key]: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
      onBlur={commit}
    />
  );
  const text = (i: number, key: TextKey, placeholder: string, mono = false) => (
    <input
      className={`${cell} ${mono ? "font-mono" : ""}`}
      type="text"
      placeholder={placeholder}
      value={rows[i]![key]}
      onChange={(e) => edit(i, { [key]: e.target.value })}
      onBlur={commit}
    />
  );

  return (
    <Section
      title="Shipment management"
      icon={<ApartmentOutlined />}
      bodyClassName="p-0"
      extra={
        <span>
          Base position <span className="font-mono text-slate-700">{base}</span> · one container, up to {MAX_DROPS} drops
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className={`border-collapse text-xs table-fixed ${TABLE_MIN_WIDTH}`}>
          <colgroup>
            {COLUMNS.map((c, i) => (
              <col key={i} className={c.width} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {COLUMNS.map((c, i) => (
                <th key={i} className="text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-slate-400">
                  No sub-positions — the whole position moves in one run.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="group border-b border-slate-100">
                <td className="px-2 py-1">
                  <span className="font-mono font-semibold text-slate-900 whitespace-nowrap">
                    {base}-{i + 1}
                  </span>
                </td>
                <td className="px-2 py-1">
                  <input className={`${cell} font-mono`} type="date" aria-label="ETW" value={r.etw} onChange={(e) => change(i, { etw: e.target.value })} />
                </td>
                <td className="px-2 py-1">{num(i, "qty", "0")}</td>
                <td className="px-2 py-1">
                  <select className={`${cell} cursor-pointer`} value={r.packing} onChange={(e) => change(i, { packing: e.target.value })}>
                    <option value="">—</option>
                    {PACKINGS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">{num(i, "width", "cm")}</td>
                <td className="px-2 py-1">{num(i, "length", "cm")}</td>
                <td className="px-2 py-1">{num(i, "height", "cm")}</td>
                <td className="px-2 py-1">{text(i, "description", "What is on this drop")}</td>
                <td className="px-2 py-1">{num(i, "weight", "kg")}</td>
                <td className="px-2 py-1">{num(i, "measure", "cbm", 0.01)}</td>
                <td className="px-2 py-1">{num(i, "totalGross", "kg")}</td>
                <td className="px-2 py-1">{text(i, "plate", "1A1 1122", true)}</td>
                <td className="px-2 py-1">{text(i, "driver", "Driver name")}</td>
                <td className="px-2 py-1">{text(i, "transport", "Carrier")}</td>
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    aria-label="VGM required"
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    checked={r.vgm}
                    onChange={(e) => change(i, { vgm: e.target.checked, vgmDate: e.target.checked ? r.vgmDate : "" })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input className={`${cell} font-mono`} type="date" disabled={!r.vgm} value={r.vgmDate} onChange={(e) => change(i, { vgmDate: e.target.value })} />
                </td>
                <td className="px-2 py-1">{num(i, "storageDays", "0")}</td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    title="Remove sub-position"
                    aria-label="Remove sub-position"
                    onClick={() => persist(rows.filter((_, idx) => idx !== i))}
                    className="w-6 h-6 rounded-full border border-transparent group-hover:border-slate-200 bg-transparent text-slate-400 hover:text-red-500 hover:!border-red-400 cursor-pointer p-0 leading-none"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold text-slate-600">
              <td className="px-2 py-2">Total</td>
              <td />
              <td className="px-2 py-2 font-mono">{qty}</td>
              <td colSpan={5} />
              <td className="px-2 py-2 font-mono whitespace-nowrap">{fmt(weight, "kg")}</td>
              <td className="px-2 py-2 font-mono whitespace-nowrap">{fmt(measure, "cbm")}</td>
              <td className="px-2 py-2 font-mono whitespace-nowrap">{fmt(gross, "kg")}</td>
              <td colSpan={7} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-t border-slate-100">
        <Button size="small" icon={<PlusOutlined />} disabled={full} onClick={() => persist([...rows, blankDrop()])}>
          Add sub-position
        </Button>
        <span className="text-xs text-slate-400">
          {rows.length} of {MAX_DROPS} drops
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Total label={`Total ${TERMS.pieces.toLowerCase()}`}>{qty}</Total>
          <Total label="Total weight">{fmt(weight, "kg")}</Total>
          <Total label="Total volume">{fmt(measure, "cbm")}</Total>
        </div>
      </div>
    </Section>
  );
}
