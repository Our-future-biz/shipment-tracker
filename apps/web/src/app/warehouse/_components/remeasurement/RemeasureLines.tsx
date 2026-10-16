"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, InputNumber, Tag } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { SavedMeanwhile } from "@/app/shipments/[jobNumber]/tabs/warehouse/JobExtras";
import { Card } from "../tabs/shared";
import { EMPTY_LINE, LINE_FIELDS, fieldInvalid, lineCbm, lineInvalid, linesTotals, parseLines, toNum, type LineField } from "../../_lib/cargoCompare";
import type { JobDraft } from "./useJobDraft";
import { useListKeys } from "@/hooks/useListKeys";

// Block C — the warehouse's remeasured lines. Number inputs with their units; Tab moves Qty → L →
// W → H → kg along the line, Enter adds a new line and puts the cursor in its Qty. Saved with the
// notes from the one "Save changes" bar.

const INPUT: Record<LineField, { label: string; suffix: string; step: number; precision?: number }> = {
  pieces: { label: "Qty", suffix: "pcs", step: 1, precision: 0 },
  lengthCm: { label: "L", suffix: "cm", step: 0.1 },
  widthCm: { label: "W", suffix: "cm", step: 0.1 },
  heightCm: { label: "H", suffix: "cm", step: 0.1 },
  weightPerPcKg: { label: "Weight / pc", suffix: "kg", step: 0.1 },
};

// Saved lines in a few words, for the "saved meanwhile" notice.
function describe(json: string): string {
  const lines = parseLines(json);
  if (!lines.length) return "(no lines)";
  return lines.map((r) => `${r.pieces || "—"} × ${r.lengthCm || "—"} × ${r.widthCm || "—"} × ${r.heightCm || "—"} cm, ${r.weightPerPcKg || "—"} kg/pc`).join("\n");
}

interface RemeasureLinesProps {
  draft: JobDraft;
  readOnly?: boolean;
}

export function RemeasureLines({ draft, readOnly }: RemeasureLinesProps) {
  const { rows, setRows } = draft;
  // Stable row keys: each InputNumber keeps the text typed into its own line.
  const rowKeys = useListKeys(rows.length);
  const tableRef = useRef<HTMLTableElement>(null);
  const [focusLine, setFocusLine] = useState<number | null>(null);

  // After Enter added a line, the cursor goes to its Qty.
  useEffect(() => {
    if (focusLine == null) return;
    tableRef.current?.querySelector<HTMLInputElement>(`td[data-cell="${focusLine}-pieces"] input`)?.focus();
    setFocusLine(null);
  }, [focusLine, rows.length]);

  const update = (idx: number, field: LineField, value: string) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  const addAfter = (idx: number) => {
    rowKeys.insert(idx + 1);
    setRows((prev) => [...prev.slice(0, idx + 1), { ...EMPTY_LINE }, ...prev.slice(idx + 1)]);
    setFocusLine(idx + 1);
  };
  const remove = (idx: number) => {
    if (rows.length > 1) rowKeys.remove(idx);
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ ...EMPTY_LINE }]));
  };
  const onKeyDown = (idx: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    addAfter(idx);
  };

  const totals = linesTotals(rows);

  return (
    <Card
      title="Remeasurement"
      extra={
        !readOnly && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => addAfter(rows.length - 1)}>
            Line
          </Button>
        )
      }
    >
      {!readOnly && draft.linesConflict && (
        <SavedMeanwhile theirs={describe(draft.savedLines)} onUseTheirs={draft.linesUseTheirs} onKeepMine={draft.linesKeepMine} />
      )}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="w-[32px] text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
              {LINE_FIELDS.map((f) => (
                <th key={f} className="text-left px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {INPUT[f].label}
                </th>
              ))}
              <th className="text-right px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Volume cbm</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={rowKeys.keys[idx]} className={`border-b border-slate-100 ${lineInvalid(row) ? "bg-red-50" : ""}`}>
                <td className="px-2 text-slate-400 tabular-nums">{idx + 1}</td>
                {LINE_FIELDS.map((f) => {
                  const bad = fieldInvalid(row, f);
                  return (
                    <td key={f} className="p-0.5 px-1" data-cell={`${idx}-${f}`}>
                      {readOnly ? (
                        <span className={`block px-2 py-1 ${bad ? "text-red-600" : row[f] ? "text-slate-900" : "text-slate-300"}`}>
                          {row[f] ? `${row[f]} ${INPUT[f].suffix}` : "—"}
                        </span>
                      ) : (
                        <InputNumber
                          size="small"
                          min={0}
                          step={INPUT[f].step}
                          precision={INPUT[f].precision}
                          suffix={INPUT[f].suffix}
                          controls={false}
                          aria-label={`Line ${idx + 1} ${INPUT[f].label} (${INPUT[f].suffix})`}
                          // A decimal comma as typed in the Czech locale ("1,5" = 1.5). The input parses
                          // the returned text itself (an empty one clears it), hence the cast.
                          parser={(v) => (v ?? "").replace(/\s/g, "").replace(",", ".") as unknown as number}
                          status={bad ? "error" : undefined}
                          // An old free-text value that is not a number shows as the hint until re-entered.
                          placeholder={bad ? row[f] : "0"}
                          title={bad ? `"${row[f]}" is not a valid number — re-enter it` : undefined}
                          value={bad || !row[f].trim() ? null : toNum(row[f])}
                          onChange={(v) => update(idx, f, v == null ? "" : String(v))}
                          onKeyDown={onKeyDown(idx)}
                          className="!w-full"
                        />
                      )}
                    </td>
                  );
                })}
                <td className="p-0.5 px-2 text-right text-[11px] text-slate-500 tabular-nums">
                  {lineInvalid(row) ? (
                    <Tag color="red" className="m-0 !text-[10px]">
                      invalid — re-enter
                    </Tag>
                  ) : lineCbm(row) > 0 ? (
                    lineCbm(row).toFixed(3)
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-0.5 px-1">
                  {!readOnly && (
                    <Button
                      type="text"
                      size="small"
                      danger
                      aria-label={`Remove line ${idx + 1}`}
                      tabIndex={-1}
                      icon={<DeleteOutlined className="text-[11px]" />}
                      onClick={() => remove(idx)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-baseline gap-8 mt-3 pt-3 border-t border-slate-200">
        {[
          ["Total pieces", totals.pieces ? String(totals.pieces) : "—"],
          ["Total weight", totals.kg > 0 ? `${totals.kg.toFixed(1)} kg` : "—"],
          ["Total volume", totals.cbm > 0 ? `${totals.cbm.toFixed(3)} cbm` : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{k}</div>
            <div className="text-[15px] font-bold text-slate-900 mt-0.5 tabular-nums">{v}</div>
          </div>
        ))}
        {!readOnly && <span className="ml-auto text-[11px] text-slate-400">Tab moves along the line · Enter adds a line</span>}
      </div>
      {draft.invalidLines > 0 && !readOnly && (
        <div className="mt-2 text-xs text-red-600">
          {draft.invalidLines} line{draft.invalidLines === 1 ? " has" : "s have"} a value that is not a number — re-enter it before saving.
        </div>
      )}
    </Card>
  );
}
