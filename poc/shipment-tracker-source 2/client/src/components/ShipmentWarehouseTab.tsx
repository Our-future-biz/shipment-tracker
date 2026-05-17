import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Upload,
  Paperclip,
  Lock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

// ─── Design System ───────────────────────────────────────────────────────────

// Style tokens — all mode-aware via CSS variables so light/dark modes work
const S = {
  bg0: "hsl(var(--surface-7))",
  bg1: "hsl(var(--surface-9))",
  bg2: "hsl(var(--surface-11))",
  border: "hsl(var(--surface-18))",
  text: "hsl(var(--fg-96))",
  muted: "hsl(var(--muted-55))",
  dim: "hsl(var(--muted-45))",
  green: "var(--brand-green)",
  teal: "var(--brand-teal)",
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface RemeasureRow {
  qty: string;
  l: string;
  w: string;
  h: string;
  weight: string;
}

interface JobData {
  container: string;
  colli: string;
  packing: string;
  weight: string;
  volume: string;
  wm: string;
  notes: string;
  customsMode: string;
  remeasure_rows: string; // JSON string of RemeasureRow[]
  vgm_sent: string;
  survey_sent: string;
  remeasurement_sent: string;
  inform_operations_sent: string;
  announced: string;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastFnWH: ((msg: string, type?: "success" | "error") => void) | null = null;

function ToastContainer() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    toastFnWH = (msg, type = "success") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    };
    return () => {
      toastFnWH = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: t.type === "error" ? "#7f1d1d" : "#14532d",
            border: `1px solid ${t.type === "error" ? "var(--brand-red)" : S.green}`,
            color: S.text,
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>,
    document.body
  );
}

function showToast(msg: string, type: "success" | "error" = "success") {
  if (toastFnWH) toastFnWH(msg, type);
}

// ─── SpreadsheetTable ─────────────────────────────────────────────────────────

interface SpreadsheetTableProps {
  columns: string[];
  rows: string[][];
  onRowsChange: (rows: string[][]) => void;
  minRows?: number;
}

function SpreadsheetTable({
  columns,
  rows,
  onRowsChange,
  minRows = 3,
}: SpreadsheetTableProps) {
  const ensureMinRows = useCallback(
    (r: string[][]) => {
      const result = [...r];
      while (result.length < minRows) {
        result.push(columns.map(() => ""));
      }
      return result;
    },
    [columns, minRows]
  );

  const displayRows = ensureMinRows(rows);

  function handleCellChange(rowIdx: number, colIdx: number, val: string) {
    const next = displayRows.map((r) => [...r]);
    next[rowIdx][colIdx] = val;
    onRowsChange(next);
  }

  function handleDeleteRow(rowIdx: number) {
    if (displayRows.length <= minRows) {
      const next = displayRows.map((r, i) =>
        i === rowIdx ? columns.map(() => "") : [...r]
      );
      onRowsChange(next);
    } else {
      const next = displayRows.filter((_, i) => i !== rowIdx);
      onRowsChange(next);
    }
  }

  function handleAddRow() {
    onRowsChange([...displayRows, columns.map(() => "")]);
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: "6px 8px",
                  textAlign: "left",
                  color: S.muted,
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  borderBottom: `1px solid ${S.border}`,
                  background: S.bg1,
                  whiteSpace: "nowrap",
                }}
              >
                {col}
              </th>
            ))}
            <th
              style={{
                width: 32,
                borderBottom: `1px solid ${S.border}`,
                background: S.bg1,
              }}
            />
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              style={{ background: rowIdx % 2 === 0 ? S.bg1 : S.bg2 }}
            >
              {columns.map((_, colIdx) => (
                <td
                  key={colIdx}
                  style={{ padding: "2px 4px", borderBottom: `1px solid ${S.border}` }}
                >
                  <input
                    value={row[colIdx] ?? ""}
                    onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: S.text,
                      fontSize: 13,
                      padding: "4px 4px",
                      width: "100%",
                      minWidth: 60,
                      outline: "none",
                      borderRadius: 3,
                    }}
                    onFocus={(e) => (e.currentTarget.style.background = "hsl(var(--surface-15))")}
                    onBlur={(e) => (e.currentTarget.style.background = "transparent")}
                    data-testid={`swt-spreadsheet-cell-${rowIdx}-${colIdx}`}
                  />
                </td>
              ))}
              <td
                style={{
                  padding: "2px 4px",
                  borderBottom: `1px solid ${S.border}`,
                  textAlign: "center",
                }}
              >
                <button
                  onClick={() => handleDeleteRow(rowIdx)}
                  style={{
                    background: "none",
                    border: "none",
                    color: S.dim,
                    cursor: "pointer",
                    padding: "2px 4px",
                    borderRadius: 3,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand-red)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = S.dim)}
                  data-testid={`swt-spreadsheet-delete-row-${rowIdx}`}
                >
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={handleAddRow}
        style={{
          marginTop: 8,
          background: "none",
          border: `1px dashed ${S.border}`,
          color: S.muted,
          cursor: "pointer",
          padding: "4px 12px",
          borderRadius: 4,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = S.teal)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = S.border)}
        data-testid="swt-spreadsheet-add-row"
      >
        <Plus size={12} /> Add row
      </button>
    </div>
  );
}

// ─── ActionPushButton ─────────────────────────────────────────────────────────

interface ActionPushButtonProps {
  label: string;
  sentTimestamp: string;
  onSend: (note: string) => void;
}

function ActionPushButton({ label, sentTimestamp, onSend }: ActionPushButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [note, setNote] = useState("");
  const isSent = !!sentTimestamp;

  function handleSend() {
    onSend(note);
    setModalOpen(false);
    setNote("");
  }

  return (
    <>
      <button
        onClick={() => {
          if (!isSent) setModalOpen(true);
        }}
        style={{
          background: isSent ? "#14532d" : S.bg0,
          border: `1px solid ${isSent ? S.green : S.border}`,
          color: isSent ? S.green : S.text,
          padding: "10px 12px",
          borderRadius: 6,
          cursor: isSent ? "default" : "pointer",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "center",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
        data-testid={`swt-action-push-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {isSent ? <Check size={16} /> : <Upload size={16} />}
        <span>{label}</span>
        {isSent && (
          <span style={{ fontSize: 10, color: S.muted, fontWeight: 400 }}>
            {new Date(sentTimestamp).toLocaleString("cs-CZ", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </button>

      {modalOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: 3001,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div
              style={{
                background: S.bg1,
                border: `1px solid ${S.border}`,
                borderRadius: 10,
                padding: 24,
                width: 360,
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <span style={{ color: S.text, fontWeight: 700, fontSize: 15 }}>
                  {label}
                </span>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: S.dim,
                    cursor: "pointer",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div
                style={{
                  border: `2px dashed ${S.border}`,
                  borderRadius: 8,
                  padding: "24px 16px",
                  textAlign: "center",
                  color: S.muted,
                  fontSize: 13,
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Paperclip size={20} style={{ opacity: 0.5 }} />
                <div>Drop files or click to upload</div>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                style={{
                  width: "100%",
                  background: S.bg2,
                  border: `1px solid ${S.border}`,
                  borderRadius: 6,
                  color: S.text,
                  fontSize: 13,
                  padding: "8px 10px",
                  resize: "vertical",
                  minHeight: 64,
                  marginBottom: 12,
                  outline: "none",
                  boxSizing: "border-box",
                }}
                data-testid={`swt-action-note-${label.toLowerCase().replace(/\s+/g, "-")}`}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: "none",
                    border: `1px solid ${S.border}`,
                    color: S.muted,
                    padding: "6px 16px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  style={{
                    background: S.green,
                    border: "none",
                    color: "#000",
                    padding: "6px 16px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                  data-testid={`swt-action-send-${label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  Send
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ─── ShipmentDetailsSection ───────────────────────────────────────────────────

interface ShipmentDetailsSectionProps {
  jobNumber: string;
  jobData: JobData;
  onJobDataChange: (d: JobData) => void;
  onSave: () => void;
  saving: boolean;
  stackable?: boolean;
  fullSheetData?: Record<string, string>;
}

function ShipmentDetailsSection({
  jobData,
  onJobDataChange,
  onSave,
  saving,
  stackable,
  fullSheetData,
}: ShipmentDetailsSectionProps) {
  const [remRows, setRemRows] = useState<RemeasureRow[]>(() => {
    try {
      return JSON.parse(jobData.remeasure_rows || "[]");
    } catch {
      return [];
    }
  });

  // Sync remRows back to jobData
  useEffect(() => {
    onJobDataChange({ ...jobData, remeasure_rows: JSON.stringify(remRows) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remRows]);

  // Mapping: warehouse field key → Full Sheet column name
  // Note: PCS, Packing, Stackable columns were removed from Full Sheet — those values now live
  // inside the Dimensions popup JSON (extra["_dimensions"]). We aggregate them on the fly.
  const fsMapping: Partial<Record<keyof JobData, string>> = {
    container: "Container Number",
    colli: "__dims_colli__",
    packing: "__dims_packing__",
    weight: "__dims_weight_kg__",     // KG (the input label says KG)
    volume: "Total Volume In CBM",
    wm: "__weight_measure__",          // = Freight Ton (max of weight tons vs CBM)
    notes: "Free Comments",
    customsMode: "Customs Procedure",
  };

  // Parse dimensions JSON once per render and derive Colli / Packing / Weight-kg
  function dimsTotals(): { colli: number; weightKg: number; packing: string } {
    const json = fullSheetData?.["_dimensions"] || "";
    if (!json) return { colli: 0, weightKg: 0, packing: "" };
    try {
      const rows = JSON.parse(json) as Array<{ colli?: string; weightPerPiece?: string; packing?: string }>;
      let colli = 0;
      let weightKg = 0;
      const packings = new Set<string>();
      for (const r of rows) {
        const c = parseFloat(r.colli || "0") || 0;
        const w = parseFloat(r.weightPerPiece || "0") || 0;
        colli += c;
        weightKg += c * w;
        if (r.packing) packings.add(r.packing);
      }
      // If exactly one packing kind across rows, surface it; otherwise show "Mixed"
      const packing = packings.size === 1 ? Array.from(packings)[0] : (packings.size > 1 ? "Mixed" : "");
      return { colli, weightKg, packing };
    } catch { return { colli: 0, weightKg: 0, packing: "" }; }
  }

  function getFullSheetValue(key: keyof JobData): string {
    if (!fullSheetData) return "";
    const fsCol = fsMapping[key];
    if (!fsCol) return "";
    if (fsCol === "__dims_colli__") {
      const t = dimsTotals();
      return t.colli > 0 ? String(t.colli) : "";
    }
    if (fsCol === "__dims_packing__") {
      const t = dimsTotals();
      return t.packing;
    }
    if (fsCol === "__dims_weight_kg__") {
      const t = dimsTotals();
      if (t.weightKg > 0) return t.weightKg.toFixed(2);
      // Fall back to Total Weight In Tons × 1000 if dimensions are empty but tons is set
      const tons = parseFloat(fullSheetData["Total Weight In Tons"] || "0") || 0;
      return tons > 0 ? (tons * 1000).toFixed(2) : "";
    }
    if (fsCol === "__weight_measure__") {
      const tons = parseFloat(fullSheetData["Total Weight In Tons"] || "0") || 0;
      const cbm = parseFloat(fullSheetData["Total Volume In CBM"] || "0") || 0;
      const wm = Math.max(tons, cbm);
      return wm > 0 ? wm.toFixed(3) : "";
    }
    return fullSheetData[fsCol] || "";
  }

  const isLinked = !!fullSheetData; // read-only when linked to Full Sheet

  function field(label: string, key: keyof JobData, placeholder?: string) {
    const linkedVal = getFullSheetValue(key);
    const displayVal = isLinked && fsMapping[key] ? linkedVal : (jobData[key] as string) || "";
    const readOnly = isLinked && !!fsMapping[key];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label
          style={{
            fontSize: 11,
            color: readOnly ? S.teal : S.muted,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {label}{readOnly && " ↗"}
        </label>
        <input
          value={displayVal}
          onChange={readOnly ? undefined : (e) => onJobDataChange({ ...jobData, [key]: e.target.value })}
          readOnly={readOnly}
          placeholder={placeholder || ""}
          style={{
            background: readOnly ? "rgba(20, 184, 166, 0.05)" : S.bg2,
            border: `1px solid ${readOnly ? "var(--brand-teal-soft)" : S.border}`,
            borderRadius: 6,
            color: readOnly ? S.teal : S.text,
            fontSize: 13,
            padding: "6px 10px",
            outline: "none",
            cursor: readOnly ? "default" : "text",
          }}
          onFocus={readOnly ? undefined : (e) => (e.currentTarget.style.borderColor = S.teal)}
          onBlur={readOnly ? undefined : (e) => (e.currentTarget.style.borderColor = S.border)}
          data-testid={`swt-shipment-field-${key}`}
        />
      </div>
    );
  }

  // Remeasurement calculations
  const calcCBM = (r: RemeasureRow) => {
    const qty = parseFloat(r.qty) || 0;
    const l = parseFloat(r.l) || 0;
    const w = parseFloat(r.w) || 0;
    const h = parseFloat(r.h) || 0;
    return (qty * l * w * h) / 1_000_000;
  };

  const totalQty = remRows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
  const totalWeight = remRows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
  const totalCBM = remRows.reduce((s, r) => s + calcCBM(r), 0);

  function updateRemRow(idx: number, key: keyof RemeasureRow, val: string) {
    setRemRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  }

  function addRemRow() {
    setRemRows((prev) => [...prev, { qty: "", l: "", w: "", h: "", weight: "" }]);
  }

  function deleteRemRow(idx: number) {
    setRemRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // Comparison
  const shipColli = parseFloat(jobData.colli) || 0;
  const shipWeight = parseFloat(jobData.weight) || 0;
  const shipVolume = parseFloat(jobData.volume) || 0;

  const colliDiff = totalQty - shipColli;
  const weightDiff = totalWeight - shipWeight;
  const volumeDiff = totalCBM - shipVolume;
  const hasMismatch =
    remRows.length > 0 &&
    (Math.abs(colliDiff) > 0.001 ||
      Math.abs(weightDiff) > 0.001 ||
      Math.abs(volumeDiff) > 0.001);
  const allMatch = remRows.length > 0 && !hasMismatch;

  function handleSendInformOps() {
    const ts = new Date().toISOString();
    onJobDataChange({ ...jobData, inform_operations_sent: ts });
    showToast("Operations informed");
  }

  function handleActionSend(key: keyof JobData) {
    return () => {
      const ts = new Date().toISOString();
      onJobDataChange({ ...jobData, [key]: ts });
    };
  }

  const tileStyle = (accent: string): React.CSSProperties => ({
    background: S.bg1,
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    padding: 16,
    borderTop: `2px solid ${accent}`,
    marginBottom: 16,
  });

  return (
    <div>
      {/* Shipment details tile */}
      <div style={tileStyle(S.teal)}>
        <div
          style={{
            color: S.teal,
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 12,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Shipment Details
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          {field("Container", "container")}
          {field("Colli", "colli")}
          {field("Packing", "packing")}
          {field("Weight (kg)", "weight")}
          {field("Volume (m³)", "volume")}
          {/* Stackability — read-only badge linked to Full Sheet */}
          <div>
            <div style={{ fontSize: 10, color: S.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Stackability</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: stackable ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: stackable ? "var(--brand-green)" : "var(--brand-red)",
              border: `1px solid ${stackable ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: stackable ? "var(--brand-green)" : "var(--brand-red)" }} />
              {stackable ? "Stackable" : "Not Stackable"}
            </div>
          </div>
          {field("W/M", "wm")}
          {field("Notes", "notes")}
          {field("Customs Mode", "customsMode")}
        </div>
      </div>

      {/* Remeasurement tile */}
      <div style={tileStyle("var(--brand-amber)")}>
        <div
          style={{
            color: "var(--brand-amber)",
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 12,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Remeasurement
        </div>
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr>
                {["QTY", "L (cm)", "W (cm)", "H (cm)", "Weight (kg)", "Total Volume In CBM"].map(
                  (col) => (
                    <th
                      key={col}
                      style={{
                        padding: "5px 8px",
                        textAlign: "left",
                        color: S.muted,
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        borderBottom: `1px solid ${S.border}`,
                      }}
                    >
                      {col}
                    </th>
                  )
                )}
                <th style={{ width: 32, borderBottom: `1px solid ${S.border}` }} />
              </tr>
            </thead>
            <tbody>
              {remRows.map((row, idx) => {
                const cbm = calcCBM(row);
                return (
                  <tr
                    key={idx}
                    style={{ background: idx % 2 === 0 ? S.bg2 : S.bg1 }}
                  >
                    {(["qty", "l", "w", "h", "weight"] as (keyof RemeasureRow)[]).map(
                      (k) => (
                        <td
                          key={k}
                          style={{
                            padding: "2px 4px",
                            borderBottom: `1px solid ${S.border}`,
                          }}
                        >
                          <input
                            value={row[k]}
                            onChange={(e) => updateRemRow(idx, k, e.target.value)}
                            type="number"
                            min="0"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: S.text,
                              fontSize: 13,
                              padding: "4px",
                              width: 72,
                              outline: "none",
                              borderRadius: 3,
                            }}
                            onFocus={(e) =>
                              (e.currentTarget.style.background = "hsl(var(--surface-15))")
                            }
                            onBlur={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                            data-testid={`swt-remeasure-${idx}-${k}`}
                          />
                        </td>
                      )
                    )}
                    <td
                      style={{
                        padding: "4px 8px",
                        borderBottom: `1px solid ${S.border}`,
                        color: S.muted,
                        fontSize: 13,
                      }}
                    >
                      {cbm.toFixed(4)}
                    </td>
                    <td
                      style={{
                        padding: "2px 4px",
                        borderBottom: `1px solid ${S.border}`,
                      }}
                    >
                      <button
                        onClick={() => deleteRemRow(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: S.dim,
                          cursor: "pointer",
                          padding: "2px 4px",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "var(--brand-red)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = S.dim)
                        }
                        data-testid={`swt-remeasure-delete-${idx}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {/* Total row */}
              {remRows.length > 0 && (
                <tr style={{ background: "hsl(var(--surface-15))", fontWeight: 700 }}>
                  <td
                    style={{
                      padding: "5px 8px",
                      color: S.teal,
                      fontSize: 13,
                      borderTop: `1px solid ${S.border}`,
                    }}
                  >
                    {totalQty.toFixed(0)}
                  </td>
                  <td
                    colSpan={3}
                    style={{
                      padding: "5px 8px",
                      borderTop: `1px solid ${S.border}`,
                    }}
                  />
                  <td
                    style={{
                      padding: "5px 8px",
                      color: S.teal,
                      fontSize: 13,
                      borderTop: `1px solid ${S.border}`,
                    }}
                  >
                    {totalWeight.toFixed(2)}
                  </td>
                  <td
                    style={{
                      padding: "5px 8px",
                      color: S.teal,
                      fontSize: 13,
                      borderTop: `1px solid ${S.border}`,
                    }}
                  >
                    {totalCBM.toFixed(4)}
                  </td>
                  <td style={{ borderTop: `1px solid ${S.border}` }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          onClick={addRemRow}
          style={{
            background: "none",
            border: `1px dashed ${S.border}`,
            color: S.muted,
            cursor: "pointer",
            padding: "4px 12px",
            borderRadius: 4,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 16,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand-amber)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = S.border)}
          data-testid="swt-remeasure-add-row"
        >
          <Plus size={12} /> Add dimension
        </button>

        {/* Comparison cards */}
        {remRows.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginBottom: 12,
            }}
          >
            {[
              { label: "Colli", ship: shipColli, remeas: totalQty, diff: colliDiff, unit: "" },
              { label: "Weight", ship: shipWeight, remeas: totalWeight, diff: weightDiff, unit: " kg" },
              { label: "Volume", ship: shipVolume, remeas: totalCBM, diff: volumeDiff, unit: " m³" },
            ].map(({ label, ship, remeas, diff, unit }) => {
              const mismatch = Math.abs(diff) > 0.001;
              return (
                <div
                  key={label}
                  style={{
                    background: S.bg2,
                    border: `1px solid ${mismatch ? "var(--brand-red)" : S.border}`,
                    borderRadius: 6,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      color: S.muted,
                      fontSize: 11,
                      marginBottom: 6,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: S.dim }}>Shipment</span>
                    <span style={{ color: S.text }}>
                      {ship}
                      {unit}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: S.dim }}>Remeas.</span>
                    <span style={{ color: S.text }}>
                      {remeas.toFixed(label === "Volume" ? 4 : 2)}
                      {unit}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: mismatch ? "var(--brand-red)" : S.green,
                      borderTop: `1px solid ${S.border}`,
                      paddingTop: 4,
                    }}
                  >
                    {mismatch
                      ? `Diff: ${diff > 0 ? "+" : ""}${diff.toFixed(
                          label === "Volume" ? 4 : 2
                        )}${unit}`
                      : "✓ Match"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Inform operations / all match banner */}
        {hasMismatch && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: "#450a0a",
              border: "1px solid #ef4444",
              borderRadius: 6,
              marginBottom: 8,
            }}
          >
            <AlertTriangle size={14} color="var(--brand-red)" />
            <span style={{ color: "#fca5a5", fontSize: 13, flex: 1 }}>
              Values mismatch detected
            </span>
            {!jobData.inform_operations_sent ? (
              <button
                onClick={handleSendInformOps}
                style={{
                  background: "var(--brand-red)",
                  border: "none",
                  color: "#fff",
                  padding: "4px 12px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
                data-testid="swt-inform-operations-btn"
              >
                Inform Operations
              </button>
            ) : (
              <span style={{ color: S.green, fontSize: 12 }}>
                Informed{" "}
                {new Date(jobData.inform_operations_sent).toLocaleString("cs-CZ", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        )}
        {allMatch && (
          <div
            style={{
              padding: "8px 12px",
              background: "#14532d",
              border: `1px solid ${S.green}`,
              borderRadius: 6,
              color: S.green,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ✓ All values match
          </div>
        )}
      </div>

      {/* Action push buttons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <ActionPushButton
          label="VGM"
          sentTimestamp={jobData.vgm_sent || ""}
          onSend={handleActionSend("vgm_sent")}
        />
        <ActionPushButton
          label="Survey"
          sentTimestamp={jobData.survey_sent || ""}
          onSend={handleActionSend("survey_sent")}
        />
        <ActionPushButton
          label="Remeasurement"
          sentTimestamp={jobData.remeasurement_sent || ""}
          onSend={handleActionSend("remeasurement_sent")}
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        style={{
          background: S.teal,
          border: "none",
          color: "#000",
          padding: "8px 20px",
          borderRadius: 6,
          cursor: saving ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
          opacity: saving ? 0.7 : 1,
        }}
        data-testid="swt-shipment-save-btn"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

// ─── CustomsSection ───────────────────────────────────────────────────────────

interface CustomsSectionProps {
  jobNumber: string;
  colli: string;
  packing: string;
  weight: string;
  fullSheetData?: Record<string, string>;
}

function CustomsSection({ jobNumber, colli, packing, weight, fullSheetData }: CustomsSectionProps) {
  const COLUMNS = ["Colli", "Packing", "Weight (kg)", "Value", "Currency", "Commodity", "HS Code"];
  // Derive Colli / Packing / Weight from the Dimensions popup JSON
  // (since PCS/Packing/Stackable columns were removed from Full Sheet).
  const dimsAgg = (() => {
    const json = fullSheetData?.["_dimensions"] || "";
    if (!json) return { colli: "", packing: "", weightKg: "" };
    try {
      const rows = JSON.parse(json) as Array<{ colli?: string; weightPerPiece?: string; packing?: string }>;
      let c = 0;
      let w = 0;
      const ps = new Set<string>();
      for (const r of rows) {
        const ci = parseFloat(r.colli || "0") || 0;
        const wi = parseFloat(r.weightPerPiece || "0") || 0;
        c += ci;
        w += ci * wi;
        if (r.packing) ps.add(r.packing);
      }
      return {
        colli: c > 0 ? String(c) : "",
        packing: ps.size === 1 ? Array.from(ps)[0] : (ps.size > 1 ? "Mixed" : ""),
        weightKg: w > 0 ? w.toFixed(2) : "",
      };
    } catch { return { colli: "", packing: "", weightKg: "" }; }
  })();
  // Full Sheet linked values for Customs info banner
  const fsColli = dimsAgg.colli || colli;
  const fsPacking = dimsAgg.packing || packing;
  // Prefer KG from dims; otherwise convert Total Weight In Tons → kg; otherwise the stored value
  const fsWeight = dimsAgg.weightKg ||
    (fullSheetData?.["Total Weight In Tons"]
      ? ((parseFloat(fullSheetData["Total Weight In Tons"]) || 0) * 1000).toFixed(2)
      : weight);
  const fsValue = fullSheetData?.["Commercial Invoice Value"] || "";
  const fsCommodity = fullSheetData?.["Cargo Description"] || "";
  const fsHsCode = fullSheetData?.["HS Code"] || "";

  const { data: sectionData, isLoading } = useQuery<{ rows: string[][] }>({
    queryKey: ["/api/wh/tasks", jobNumber, "section", "customs"],
  });

  const [rows, setRows] = useState<string[][]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sectionData?.rows) {
      setRows(sectionData.rows);
    }
  }, [sectionData]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/wh/tasks/${jobNumber}/section/customs`, { rows });
      queryClient.invalidateQueries({
        queryKey: ["/api/wh/tasks", jobNumber, "section", "customs"],
      });
      showToast("Customs saved");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div style={{ color: S.muted, padding: 24, fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      {/* Info banner — linked from Full Sheet */}
      <div
        style={{
          background: "hsl(var(--surface-15))",
          border: `1px solid ${S.teal}`,
          borderRadius: 6,
          padding: "8px 14px",
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 20px",
          fontSize: 13,
          color: S.muted,
        }}
      >
        {fullSheetData && <span style={{ fontSize: 10, color: S.teal, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", width: "100%", marginBottom: 2 }}>From Full Sheet ↗</span>}
        <span>Colli: <strong style={{ color: S.text }}>{fsColli || "—"}</strong></span>
        <span>Packing: <strong style={{ color: S.text }}>{fsPacking || "—"}</strong></span>
        <span>Weight: <strong style={{ color: S.text }}>{fsWeight || "—"} kg</strong></span>
        {fsValue && <span>Value: <strong style={{ color: S.text }}>{fsValue}</strong></span>}
        {fsCommodity && <span>Commodity: <strong style={{ color: S.text }}>{fsCommodity}</strong></span>}
        {fsHsCode && <span>HS Code: <strong style={{ color: S.text }}>{fsHsCode}</strong></span>}
      </div>

      <SpreadsheetTable columns={COLUMNS} rows={rows} onRowsChange={setRows} />

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 12,
          background: S.teal,
          border: "none",
          color: "#000",
          padding: "8px 20px",
          borderRadius: 6,
          cursor: saving ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
          opacity: saving ? 0.7 : 1,
        }}
        data-testid="swt-customs-save-btn"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ─── PickupSection ────────────────────────────────────────────────────────────

interface PickupSectionProps {
  jobNumber: string;
}

function PickupSection({ jobNumber }: PickupSectionProps) {
  const COLUMNS = ["PIN", "Haulier", "Licenseplate", "Driver"];

  const { data: sectionData, isLoading } = useQuery<{
    rows: string[][];
    pin?: string;
  }>({
    queryKey: ["/api/wh/tasks", jobNumber, "section", "pickup"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const [rows, setRows] = useState<string[][]>([]);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (sectionData && !initialized) {
      if (sectionData.rows && sectionData.rows.length > 0) setRows(sectionData.rows);
      if (sectionData.pin) setPin(sectionData.pin);
      setInitialized(true);
    } else if (sectionData && initialized) {
      // Only update pin from server (it's permanent)
      if (sectionData.pin && !pin) setPin(sectionData.pin);
    }
  }, [sectionData, initialized, pin]);

  // Auto-save helper
  async function saveToServer(newRows: string[][], newPin: string) {
    try {
      await apiRequest("PUT", `/api/wh/tasks/${jobNumber}/section/pickup`, {
        rows: newRows,
        pin: newPin,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/wh/tasks", jobNumber, "section", "pickup"],
      });
    } catch (e) {
      console.error("Auto-save pickup failed:", e);
    }
  }

  async function generatePin() {
    if (pin) return; // locked permanently once generated
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
    // Auto-write into first empty PIN cell
    const newRows = rows.map((r) => [...r]);
    const emptyIdx = newRows.findIndex((r) => !r[0]);
    if (emptyIdx >= 0) {
      newRows[emptyIdx][0] = newPin;
    } else if (newRows.length > 0) {
      newRows[0][0] = newPin;
    }
    setRows(newRows);
    // Auto-save immediately so PIN persists across tab switches
    await saveToServer(newRows, newPin);
    showToast(`PIN ${newPin} generated and saved`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/wh/tasks/${jobNumber}/section/pickup`, {
        rows,
        pin,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/wh/tasks", jobNumber, "section", "pickup"],
      });
      showToast("Pickup saved");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div style={{ color: S.muted, padding: 24, fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      {/* PIN generator */}
      <div
        style={{
          background: S.bg1,
          border: `1px solid ${S.border}`,
          borderRadius: 8,
          padding: 20,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 20,
          borderTop: `2px solid ${S.teal}`,
        }}
      >
        <div>
          <div
            style={{
              color: S.muted,
              fontSize: 11,
              marginBottom: 4,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Pickup PIN
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: 8,
              color: pin ? S.green : S.dim,
              fontVariantNumeric: "tabular-nums",
              minWidth: 120,
            }}
          >
            {pin || "– – – –"}
          </div>
        </div>
        <button
          onClick={generatePin}
          disabled={!!pin}
          style={{
            background: pin ? S.bg2 : S.green,
            border: `1px solid ${pin ? S.border : S.green}`,
            color: pin ? S.dim : "#000",
            padding: "8px 18px",
            borderRadius: 6,
            cursor: pin ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 700,
          }}
          data-testid="swt-generate-pin-btn"
        >
          {pin ? "PIN Generated" : "Generate PIN"}
        </button>
        {pin && (
          <span
            style={{
              color: S.muted,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Lock size={12} color={S.green} /> Locked permanently
          </span>
        )}
      </div>

      <SpreadsheetTable
        columns={COLUMNS}
        rows={rows}
        onRowsChange={(newRows) => {
          if (pin) {
            const pinRowExists = newRows.some((r) => r[0] === pin);
            if (!pinRowExists) {
              const oldPinRow = rows.find((r) => r[0] === pin);
              if (oldPinRow) {
                const clearedIdx = newRows.findIndex((r, i) => rows[i] && rows[i][0] === pin && !r[0]);
                if (clearedIdx >= 0) {
                  const restored = newRows.map((r) => [...r]);
                  restored[clearedIdx][0] = pin;
                  setRows(restored);
                  return;
                }
                setRows([oldPinRow, ...newRows]);
                return;
              }
            }
          }
          setRows(newRows);
        }}
      />

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 12,
          background: S.teal,
          border: "none",
          color: "#000",
          padding: "8px 20px",
          borderRadius: 6,
          cursor: saving ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
          opacity: saving ? 0.7 : 1,
        }}
        data-testid="swt-pickup-save-btn"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ─── InvoicingSection ─────────────────────────────────────────────────────────

interface InvoicingSectionProps {
  jobNumber: string;
}

function InvoicingSection({ jobNumber }: InvoicingSectionProps) {
  const COLUMNS = ["Invoice #", "Date", "Amount", "Currency", "Shipment Status", "Notes"];

  const { data: sectionData, isLoading } = useQuery<{ rows: string[][] }>({
    queryKey: ["/api/wh/tasks", jobNumber, "section", "invoicing"],
  });

  const [rows, setRows] = useState<string[][]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sectionData?.rows) {
      setRows(sectionData.rows);
    }
  }, [sectionData]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/wh/tasks/${jobNumber}/section/invoicing`, {
        rows,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/wh/tasks", jobNumber, "section", "invoicing"],
      });
      showToast("Invoicing saved");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div style={{ color: S.muted, padding: 24, fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      <SpreadsheetTable columns={COLUMNS} rows={rows} onRowsChange={setRows} />
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 12,
          background: S.teal,
          border: "none",
          color: "#000",
          padding: "8px 20px",
          borderRadius: 6,
          cursor: saving ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
          opacity: saving ? 0.7 : 1,
        }}
        data-testid="swt-invoicing-save-btn"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ─── ShipmentWarehouseTab (main export) ───────────────────────────────────────

export function ShipmentWarehouseTab({ jobNumber, stackable, fullSheetData }: { jobNumber: string; stackable?: boolean; fullSheetData?: Record<string, string> }) {
  const SUB_TABS = ["Shipment details", "Customs", "Pick-up", "Invoicing"];
  const [activeTab, setActiveTab] = useState(0);

  // Fetch job section data
  const { data: jobRaw, isLoading } = useQuery<JobData>({
    queryKey: ["/api/wh/tasks", jobNumber, "section", "job"],
  });

  const [jobData, setJobData] = useState<JobData>({
    container: "",
    colli: "",
    packing: "",
    weight: "",
    volume: "",
    wm: "",
    notes: "",
    customsMode: "",
    remeasure_rows: "[]",
    vgm_sent: "",
    survey_sent: "",
    remeasurement_sent: "",
    inform_operations_sent: "",
    announced: "",
  });

  useEffect(() => {
    if (jobRaw) {
      setJobData((prev) => ({ ...prev, ...jobRaw }));
    }
  }, [jobRaw]);

  const [saving, setSaving] = useState(false);

  async function handleSaveJob() {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/wh/tasks/${jobNumber}/section/job`, jobData);
      queryClient.invalidateQueries({
        queryKey: ["/api/wh/tasks", jobNumber, "section", "job"],
      });
      showToast("Changes saved");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ToastContainer />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: S.bg0,
          color: S.text,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          height: "100%",
        }}
      >
        {/* Sub-tab bar */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "12px 0 0 0",
            marginBottom: 16,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {SUB_TABS.map((tab, i) => {
            const isActive = activeTab === i;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 20,
                  border: isActive
                    ? `1px solid ${S.teal}`
                    : `1px solid ${S.border}`,
                  background: isActive ? S.teal : "transparent",
                  color: isActive ? "#000" : S.muted,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 400,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = S.teal;
                    e.currentTarget.style.color = S.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = S.border;
                    e.currentTarget.style.color = S.muted;
                  }
                }}
                data-testid={`swt-tab-${i}`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading && activeTab === 0 ? (
            <div style={{ color: S.muted, fontSize: 13, padding: 24 }}>
              Loading…
            </div>
          ) : (
            <>
              {activeTab === 0 && (
                <ShipmentDetailsSection
                  jobNumber={jobNumber}
                  jobData={jobData}
                  onJobDataChange={setJobData}
                  onSave={handleSaveJob}
                  saving={saving}
                  stackable={stackable}
                  fullSheetData={fullSheetData}
                />
              )}
              {activeTab === 1 && (
                <CustomsSection
                  jobNumber={jobNumber}
                  colli={jobData.colli}
                  packing={jobData.packing}
                  weight={fullSheetData?.["Total Weight In Tons"] || jobData.weight}
                  fullSheetData={fullSheetData}
                />
              )}
              {activeTab === 2 && <PickupSection jobNumber={jobNumber} />}
              {activeTab === 3 && <InvoicingSection jobNumber={jobNumber} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
