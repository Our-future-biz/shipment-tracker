import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Plus,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Upload,
  ChevronRight,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";

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

interface WTask {
  id: number;
  created_at?: string;
}

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
  vgm_sent: string; // "" or ISO timestamp
  survey_sent: string;
  remeasurement_sent: string;
  inform_operations_sent: string;
  announced: string;
  status?: string;
  priority?: string;
  type?: string;
}

interface CustomsRow {
  colli: string;
  packing: string;
  weight: string;
  value: string;
  currency: string;
  commodity: string;
  hsCode: string;
}

interface PickupRow {
  pin: string;
  haulier: string;
  licenseplate: string;
  driver: string;
}

interface InvoiceRow {
  invoiceNo: string;
  date: string;
  amount: string;
  currency: string;
  status: string;
  notes: string;
}

// ─── Badge helpers ───────────────────────────────────────────────────────────

function statusStyle(status: string): React.CSSProperties {
  const s = (status || "").toLowerCase();
  if (s === "completed") return { background: "#166534", color: S.green };
  if (s === "in progress") return { background: "#1E40AF", color: "#60A5FA" };
  return { background: "#78350F", color: "#FBBF24" };
}

function priorityStyle(priority: string): React.CSSProperties {
  const p = (priority || "").toLowerCase();
  if (p === "high") return { background: "#7C2D12", color: "#FCA5A5" };
  if (p === "medium") return { background: "#854D0E", color: "#FCD34D" };
  return { background: "#1E3A8A", color: "#93C5FD" };
}

function Badge({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <span
      style={{
        ...style,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastFn: ((msg: string, type?: "success" | "error") => void) | null = null;

function ToastContainer() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    toastFn = (msg, type = "success") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    };
    return () => { toastFn = null; };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
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
  if (toastFn) toastFn(msg, type);
}

// ─── SpreadsheetTable ─────────────────────────────────────────────────────────

interface SpreadsheetTableProps {
  columns: string[];
  rows: string[][];
  onRowsChange: (rows: string[][]) => void;
  minRows?: number;
}

function SpreadsheetTable({ columns, rows, onRowsChange, minRows = 3 }: SpreadsheetTableProps) {
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
            <th style={{ width: 32, borderBottom: `1px solid ${S.border}`, background: S.bg1 }} />
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              style={{ background: rowIdx % 2 === 0 ? S.bg1 : S.bg2 }}
            >
              {columns.map((_, colIdx) => (
                <td key={colIdx} style={{ padding: "2px 4px", borderBottom: `1px solid ${S.border}` }}>
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
                    data-testid={`spreadsheet-cell-${rowIdx}-${colIdx}`}
                  />
                </td>
              ))}
              <td style={{ padding: "2px 4px", borderBottom: `1px solid ${S.border}`, textAlign: "center" }}>
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
                  data-testid={`spreadsheet-delete-row-${rowIdx}`}
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
        data-testid="spreadsheet-add-row"
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
        onClick={() => { if (!isSent) setModalOpen(true); }}
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
        data-testid={`action-push-${label.toLowerCase().replace(/\s+/g, "-")}`}
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

      {modalOpen && createPortal(
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
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ color: S.text, fontWeight: 700, fontSize: 15 }}>{label}</span>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: "none", border: "none", color: S.dim, cursor: "pointer" }}
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
              }}
            >
              <Upload size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
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
              data-testid={`action-note-${label.toLowerCase().replace(/\s+/g, "-")}`}
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
                data-testid={`action-send-${label.toLowerCase().replace(/\s+/g, "-")}`}
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

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  taskId: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ taskId, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const jobLabel = taskId;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: S.bg1,
          border: "2px solid #ef4444",
          borderRadius: 10,
          padding: 28,
          width: 360,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          textAlign: "center",
        }}
      >
        <AlertTriangle size={32} color="var(--brand-red)" style={{ marginBottom: 12 }} />
        <div style={{ color: S.text, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          Delete job {jobLabel}?
        </div>
        <div style={{ color: S.muted, fontSize: 13, marginBottom: 24 }}>
          This action cannot be undone. All data will be permanently removed.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: `1px solid ${S.border}`,
              color: S.muted,
              padding: "8px 20px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
            data-testid="delete-confirm-cancel"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: "var(--brand-red)",
              border: "none",
              color: "#fff",
              padding: "8px 20px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
            data-testid="delete-confirm-ok"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── ShipmentDetailsTab ───────────────────────────────────────────────────────

interface ShipmentDetailsTabProps {
  taskId: number;
  jobData: JobData;
  onJobDataChange: (d: JobData) => void;
  onSave: () => void;
  saving: boolean;
}

function ShipmentDetailsTab({ taskId, jobData, onJobDataChange, onSave, saving }: ShipmentDetailsTabProps) {
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

  function field(
    label: string,
    key: keyof JobData,
    placeholder?: string
  ) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, color: S.muted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {label}
        </label>
        <input
          value={(jobData[key] as string) || ""}
          onChange={(e) => onJobDataChange({ ...jobData, [key]: e.target.value })}
          placeholder={placeholder || ""}
          style={{
            background: S.bg2,
            border: `1px solid ${S.border}`,
            borderRadius: 6,
            color: S.text,
            fontSize: 13,
            padding: "6px 10px",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = S.teal)}
          onBlur={(e) => (e.currentTarget.style.borderColor = S.border)}
          data-testid={`shipment-field-${key}`}
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
    return qty * l * w * h / 1_000_000;
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
  const hasMismatch = remRows.length > 0 && (Math.abs(colliDiff) > 0.001 || Math.abs(weightDiff) > 0.001 || Math.abs(volumeDiff) > 0.001);
  const allMatch = remRows.length > 0 && !hasMismatch;

  function handleSendInformOps() {
    const ts = new Date().toISOString();
    onJobDataChange({ ...jobData, inform_operations_sent: ts });
    showToast("Operations informed");
  }

  // Action push buttons
  function handleActionSend(field: keyof JobData) {
    return () => {
      const ts = new Date().toISOString();
      onJobDataChange({ ...jobData, [field]: ts });
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
        <div style={{ color: S.teal, fontWeight: 700, fontSize: 13, marginBottom: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Shipment Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {field("Container", "container")}
          {field("Colli", "colli")}
          {field("Packing", "packing")}
          {field("Weight (kg)", "weight")}
          {field("Volume (m³)", "volume")}
          {field("W/M", "wm")}
          {field("Notes", "notes")}
          {field("Customs Mode", "customsMode")}
        </div>
      </div>

      {/* Remeasurement tile */}
      <div style={tileStyle("var(--brand-amber)")}>
        <div style={{ color: "var(--brand-amber)", fontWeight: 700, fontSize: 13, marginBottom: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Remeasurement
        </div>
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["QTY", "L (cm)", "W (cm)", "H (cm)", "Weight (kg)", "Total Volume In CBM"].map((col) => (
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
                ))}
                <th style={{ width: 32, borderBottom: `1px solid ${S.border}` }} />
              </tr>
            </thead>
            <tbody>
              {remRows.map((row, idx) => {
                const cbm = calcCBM(row);
                return (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? S.bg2 : S.bg1 }}>
                    {(["qty", "l", "w", "h", "weight"] as (keyof RemeasureRow)[]).map((k) => (
                      <td key={k} style={{ padding: "2px 4px", borderBottom: `1px solid ${S.border}` }}>
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
                          onFocus={(e) => (e.currentTarget.style.background = "hsl(var(--surface-15))")}
                          onBlur={(e) => (e.currentTarget.style.background = "transparent")}
                          data-testid={`remeasure-${idx}-${k}`}
                        />
                      </td>
                    ))}
                    <td style={{ padding: "4px 8px", borderBottom: `1px solid ${S.border}`, color: S.muted, fontSize: 13 }}>
                      {cbm.toFixed(4)}
                    </td>
                    <td style={{ padding: "2px 4px", borderBottom: `1px solid ${S.border}` }}>
                      <button
                        onClick={() => deleteRemRow(idx)}
                        style={{ background: "none", border: "none", color: S.dim, cursor: "pointer", padding: "2px 4px" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand-red)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = S.dim)}
                        data-testid={`remeasure-delete-${idx}`}
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
                  <td style={{ padding: "5px 8px", color: S.teal, fontSize: 13, borderTop: `1px solid ${S.border}` }}>
                    {totalQty.toFixed(0)}
                  </td>
                  <td colSpan={3} style={{ padding: "5px 8px", borderTop: `1px solid ${S.border}` }} />
                  <td style={{ padding: "5px 8px", color: S.teal, fontSize: 13, borderTop: `1px solid ${S.border}` }}>
                    {totalWeight.toFixed(2)}
                  </td>
                  <td style={{ padding: "5px 8px", color: S.teal, fontSize: 13, borderTop: `1px solid ${S.border}` }}>
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
          data-testid="remeasure-add-row"
        >
          <Plus size={12} /> Add dimension
        </button>

        {/* Comparison cards */}
        {remRows.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
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
                  <div style={{ color: S.muted, fontSize: 11, marginBottom: 6, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {label}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: S.dim }}>Shipment</span>
                    <span style={{ color: S.text }}>{ship}{unit}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: S.dim }}>Remeas.</span>
                    <span style={{ color: S.text }}>{remeas.toFixed(label === "Volume" ? 4 : 2)}{unit}</span>
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
                    {mismatch ? `Diff: ${diff > 0 ? "+" : ""}${diff.toFixed(label === "Volume" ? 4 : 2)}${unit}` : "✓ Match"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Inform operations / all match banner */}
        {hasMismatch && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#450a0a", border: "1px solid #ef4444", borderRadius: 6, marginBottom: 8 }}>
            <AlertTriangle size={14} color="var(--brand-red)" />
            <span style={{ color: "#fca5a5", fontSize: 13, flex: 1 }}>Values mismatch detected</span>
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
                data-testid="inform-operations-btn"
              >
                Inform Operations
              </button>
            ) : (
              <span style={{ color: S.green, fontSize: 12 }}>
                Informed {new Date(jobData.inform_operations_sent).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
        {allMatch && (
          <div style={{ padding: "8px 12px", background: "#14532d", border: `1px solid ${S.green}`, borderRadius: 6, color: S.green, fontSize: 13, fontWeight: 600 }}>
            ✓ All values match
          </div>
        )}
      </div>

      {/* Action push buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
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
        data-testid="shipment-save-btn"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

// ─── CustomsTab ───────────────────────────────────────────────────────────────

interface CustomsTabProps {
  taskId: number;
  colli: string;
  packing: string;
  weight: string;
}

function CustomsTab({ taskId, colli, packing, weight }: CustomsTabProps) {
  const COLUMNS = ["Colli", "Packing", "Weight (kg)", "Value", "Currency", "Commodity", "HS Code"];

  const { data: sectionData, isLoading } = useQuery<{ rows: string[][] }>({
    queryKey: ["/api/wh/tasks", taskId, "section", "customs"],
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
      await apiRequest("PUT", `/api/wh/tasks/${taskId}/section/customs`, { rows });
      queryClient.invalidateQueries({ queryKey: ["/api/wh/tasks", taskId, "section", "customs"] });
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
      {/* Info banner */}
      <div
        style={{
          background: "hsl(var(--surface-15))",
          border: `1px solid ${S.teal}`,
          borderRadius: 6,
          padding: "8px 14px",
          marginBottom: 16,
          display: "flex",
          gap: 20,
          fontSize: 13,
          color: S.muted,
        }}
      >
        <span>Colli: <strong style={{ color: S.text }}>{colli || "—"}</strong></span>
        <span>Packing: <strong style={{ color: S.text }}>{packing || "—"}</strong></span>
        <span>Weight: <strong style={{ color: S.text }}>{weight || "—"} kg</strong></span>
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
        data-testid="customs-save-btn"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ─── PickupTab ────────────────────────────────────────────────────────────────

interface PickupTabProps {
  taskId: number;
}

function PickupTab({ taskId }: PickupTabProps) {
  const COLUMNS = ["PIN", "Haulier", "Licenseplate", "Driver"];

  const { data: sectionData, isLoading } = useQuery<{ rows: string[][]; pin?: string }>({
    queryKey: ["/api/wh/tasks", taskId, "section", "pickup"],
  });

  const [rows, setRows] = useState<string[][]>([]);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sectionData) {
      if (sectionData.rows) setRows(sectionData.rows);
      if (sectionData.pin) setPin(sectionData.pin);
    }
  }, [sectionData]);

  function generatePin() {
    if (pin) return; // locked permanently once generated
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
    // Auto-write into first empty PIN cell
    setRows((prev) => {
      const next = prev.map((r) => [...r]);
      const emptyIdx = next.findIndex((r) => !r[0]);
      if (emptyIdx >= 0) {
        next[emptyIdx][0] = newPin;
      } else if (next.length > 0) {
        next[0][0] = newPin;
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/wh/tasks/${taskId}/section/pickup`, { rows, pin });
      queryClient.invalidateQueries({ queryKey: ["/api/wh/tasks", taskId, "section", "pickup"] });
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
          <div style={{ color: S.muted, fontSize: 11, marginBottom: 4, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
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
          data-testid="generate-pin-btn"
        >
          {pin ? "PIN Generated" : "Generate PIN"}
        </button>
        {pin && (
          <span style={{ color: S.muted, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <Check size={12} color={S.green} /> Locked permanently
          </span>
        )}
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
        data-testid="pickup-save-btn"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ─── InvoicingTab (warehouse) ─────────────────────────────────────────────────

interface InvoicingWhTabProps {
  taskId: number;
}

function InvoicingWhTab({ taskId }: InvoicingWhTabProps) {
  const COLUMNS = ["Invoice #", "Date", "Amount", "Currency", "Shipment Status", "Notes"];

  const { data: sectionData, isLoading } = useQuery<{ rows: string[][] }>({
    queryKey: ["/api/wh/tasks", taskId, "section", "invoicing"],
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
      await apiRequest("PUT", `/api/wh/tasks/${taskId}/section/invoicing`, { rows });
      queryClient.invalidateQueries({ queryKey: ["/api/wh/tasks", taskId, "section", "invoicing"] });
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
        data-testid="invoicing-wh-save-btn"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ─── TaskDetailModal ──────────────────────────────────────────────────────────

interface TaskDetailModalProps {
  taskId: number;
  onClose: () => void;
  onDelete: () => void;
}

function TaskDetailModal({ taskId, onClose, onDelete }: TaskDetailModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const TABS = ["Shipment details", "Customs", "Pick-up", "Invoicing"];

  const jobLabel = taskId;

  const { data: jobRaw, isLoading } = useQuery<JobData>({
    queryKey: ["/api/wh/tasks", taskId, "section", "job"],
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
    status: "Pending",
    priority: "Medium",
    type: "Import",
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
      await apiRequest("PUT", `/api/wh/tasks/${taskId}/section/job`, jobData);
      queryClient.invalidateQueries({ queryKey: ["/api/wh/tasks", taskId, "section", "job"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wh/tasks"] });
      showToast("Changes saved");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const tabContent = [
    <ShipmentDetailsTab
      key="shipment"
      taskId={taskId}
      jobData={jobData}
      onJobDataChange={setJobData}
      onSave={handleSaveJob}
      saving={saving}
    />,
    <CustomsTab
      key="customs"
      taskId={taskId}
      colli={jobData.colli}
      packing={jobData.packing}
      weight={jobData.weight}
    />,
    <PickupTab key="pickup" taskId={taskId} />,
    <InvoicingWhTab key="invoicing" taskId={taskId} />,
  ];

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 1500,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: S.bg1,
          border: `1px solid ${S.border}`,
          borderRadius: 12,
          width: "94vw",
          maxWidth: 1200,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 64px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${S.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: S.bg0,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700, color: S.text, fontFamily: "monospace" }}>
            {jobLabel}
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
            <Badge label={jobData.status || "Pending"} style={statusStyle(jobData.status || "Pending")} />
            <Badge label={jobData.priority || "Medium"} style={priorityStyle(jobData.priority || "Medium")} />
            {jobData.type && (
              <Badge
                label={jobData.type}
                style={{ background: "#1e3a5f", color: "#7dd3fc" }}
              />
            )}
          </div>
          <button
            onClick={onDelete}
            style={{
              background: "none",
              border: `1px solid #ef4444`,
              color: "var(--brand-red)",
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            data-testid="modal-delete-btn"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: `1px solid ${S.border}`,
              color: S.muted,
              padding: "5px 8px",
              borderRadius: 6,
              cursor: "pointer",
            }}
            data-testid="modal-close-btn"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${S.border}`,
            background: S.bg0,
            flexShrink: 0,
          }}
        >
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              style={{
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderBottom: activeTab === i ? `2px solid ${S.teal}` : "2px solid transparent",
                color: activeTab === i ? S.teal : S.muted,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeTab === i ? 700 : 400,
                marginBottom: -1,
              }}
              data-testid={`modal-tab-${i}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {isLoading ? (
            <div style={{ color: S.muted, fontSize: 13 }}>Loading…</div>
          ) : (
            tabContent[activeTab]
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: WTask;
  onOpen: () => void;
  onDelete: () => void;
  searchQuery: string;
}

function TaskRow({ task, onOpen, onDelete, searchQuery }: TaskRowProps) {
  const jobLabel = String(task.id); // task.id is numeric; stringify for includes/lowercase

  const { data: jobData } = useQuery<JobData>({
    queryKey: ["/api/wh/tasks", task.id, "section", "job"],
  });

  // Filter check
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (!jobLabel.toLowerCase().includes(q) && !jobLabel.includes(q)) {
      return null;
    }
  }

  const td: React.CSSProperties = {
    padding: "9px 12px",
    borderBottom: `1px solid ${S.border}`,
    fontSize: 13,
    color: S.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 140,
  };

  return (
    <tr
      style={{ cursor: "pointer", transition: "background 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--surface-15))")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onClick={onOpen}
      data-testid={`task-row-${task.id}`}
    >
      <td style={{ ...td, color: S.teal, fontFamily: "monospace", fontWeight: 600 }}>{jobLabel}</td>
      <td style={td}>{jobData?.container || <span style={{ color: S.dim }}>—</span>}</td>
      <td style={td}>{jobData?.colli || <span style={{ color: S.dim }}>—</span>}</td>
      <td style={td}>{jobData?.packing || <span style={{ color: S.dim }}>—</span>}</td>
      <td style={td}>{jobData?.weight ? `${jobData.weight} kg` : <span style={{ color: S.dim }}>—</span>}</td>
      <td style={td}>{jobData?.volume ? `${jobData.volume} m³` : <span style={{ color: S.dim }}>—</span>}</td>
      <td style={td}>{jobData?.wm || <span style={{ color: S.dim }}>—</span>}</td>
      <td style={{ ...td, maxWidth: 180 }}>{jobData?.notes || <span style={{ color: S.dim }}>—</span>}</td>
      <td style={td}>{jobData?.customsMode || <span style={{ color: S.dim }}>—</span>}</td>
      <td style={td}>
        {jobData?.survey_sent ? (
          <span style={{ color: S.green, fontSize: 11 }}>✓ Sent</span>
        ) : (
          <span style={{ color: S.dim }}>—</span>
        )}
      </td>
      <td
        style={{ ...td, width: 40, maxWidth: 40 }}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <button
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
          data-testid={`task-delete-${task.id}`}
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── WarehouseTab (main) ──────────────────────────────────────────────────────

export function WarehouseTab() {
  const [search, setSearch] = useState("");
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);

  // Fetch all tasks
  const { data: tasks, isLoading } = useQuery<WTask[]>({
    queryKey: ["/api/wh/tasks"],
  });

  // Create new task
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/wh/tasks");
      return res.json();
    },
    onSuccess: (data: { id: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/wh/tasks"] });
      showToast(`Task WHCZ2026${String(data.id).padStart(3, "0")} created`);
      setOpenTaskId(data.id);
    },
    onError: () => showToast("Failed to create task", "error"),
  });

  // Delete task
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/wh/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wh/tasks"] });
      showToast("Task deleted");
      setDeleteTaskId(null);
      if (openTaskId === deleteTaskId) setOpenTaskId(null);
    },
    onError: () => showToast("Delete failed", "error"),
  });

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    color: S.muted,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    borderBottom: `1px solid ${S.border}`,
    background: S.bg0,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  return (
    <>
      <ToastContainer />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: S.bg0,
          color: S.text,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            borderBottom: `1px solid ${S.border}`,
            background: S.bg1,
            flexShrink: 0,
          }}
        >
          <ChevronRight size={16} color={S.teal} />
          <span style={{ fontSize: 17, fontWeight: 700, color: S.text, marginRight: "auto" }}>
            Warehouse Tasks
          </span>
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              color={S.dim}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by job ID…"
              style={{
                background: S.bg2,
                border: `1px solid ${S.border}`,
                borderRadius: 6,
                color: S.text,
                fontSize: 13,
                padding: "6px 10px 6px 30px",
                outline: "none",
                width: 220,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = S.teal)}
              onBlur={(e) => (e.currentTarget.style.borderColor = S.border)}
              data-testid="wh-search"
            />
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            style={{
              background: S.green,
              border: "none",
              color: "#000",
              padding: "7px 16px",
              borderRadius: 6,
              cursor: createMutation.isPending ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: createMutation.isPending ? 0.7 : 1,
            }}
            data-testid="new-task-btn"
          >
            <Plus size={14} />
            New Task
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                {[
                  "Internal Reference",
                  "Container",
                  "Colli",
                  "Packing",
                  "Weight",
                  "Volume",
                  "W/M",
                  "Notes",
                  "Customs mode",
                  "Survey",
                  "",
                ].map((col, i) => (
                  <th key={i} style={thStyle}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} style={{ padding: 32, textAlign: "center", color: S.muted, fontSize: 13 }}>
                    Loading tasks…
                  </td>
                </tr>
              ) : !tasks || tasks.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 48, textAlign: "center", color: S.dim, fontSize: 13 }}>
                    No tasks yet. Click "+ New Task" to create one.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    searchQuery={search}
                    onOpen={() => setOpenTaskId(task.id)}
                    onDelete={() => setDeleteTaskId(task.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TaskDetailModal */}
      {openTaskId !== null && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onDelete={() => {
            setDeleteTaskId(openTaskId);
            setOpenTaskId(null);
          }}
        />
      )}

      {/* DeleteConfirmModal */}
      {deleteTaskId !== null && (
        <DeleteConfirmModal
          taskId={deleteTaskId}
          onConfirm={() => deleteMutation.mutate(deleteTaskId)}
          onCancel={() => setDeleteTaskId(null)}
        />
      )}
    </>
  );
}
