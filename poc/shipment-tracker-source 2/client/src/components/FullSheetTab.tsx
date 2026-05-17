import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  COLUMNS,
  STATUS_COLORS,
  CUSTOMS_STATUS_COLORS,
  getColumnValue,
  isCompletedStatus,
  type Shipment,
} from "@/lib/shipment-data";
import {
  DROPDOWN_OPTIONS,
  DATE_COLUMNS,
  CHECKBOX_COLUMNS,
  getColumnType,
  getColumnWidth,
  getCellConditionalStyle,
  getRowConditionalStyle,
  type ColumnType,
} from "@/lib/column-config";
import { useShipments, setCellValue as setCellValueCtx, genId, type EditableShipment } from "@/lib/shipment-context";
import { Search, X, Filter, Plus, Lock, Unlock, GripVertical, Trash2, AlertTriangle, Copy, Check, MessageSquare, Paperclip, Layers, Unlink } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { ShipmentDetailModal } from "./ShipmentDetailModal";
import { MasterJobDetailModal } from "./MasterJobDetailModal";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";

// Fields available for copy from a previous shipment
const COPYABLE_FIELDS = [
  "Shipper",
  "Consignee",
  "Agent",
  "PIC email",
  "INCOTERM ORIGIN",
  "Incoterm destination",
  "Cargo origin",
  "Origin",
  "POL",
  "POD",
  "Destination",
  "HS code",
  "Goods description",
] as const;

// ─── Types ──────────────────────────────────────────────────────────

interface EditingCell {
  rowId: string;
  col: string;
}

interface ColumnFilter {
  type: "text" | "values";
  textValue?: string;
  selectedValues?: Set<string>;
}

function getRowBackground(s: Shipment, rowRecord: Record<string, string>): string | undefined {
  const condRow = getRowConditionalStyle(rowRecord);
  if (condRow?.backgroundColor) return condRow.backgroundColor;
  return undefined;
}

function getStatusBadgeStyle(status: string): React.CSSProperties {
  const color = STATUS_COLORS[status];
  if (!color) return {};
  return {
    backgroundColor: color + "22",
    color,
    border: `1px solid ${color}44`,
    borderRadius: "4px",
    padding: "0 5px",
    fontSize: "11px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "inline-block",
    lineHeight: "22px",
    verticalAlign: "middle",
  };
}

function getCellValueFn(s: EditableShipment, col: string): string {
  return getColumnValue(s, col);
}

function setCellValue(s: EditableShipment, col: string, value: string): EditableShipment {
  return setCellValueCtx(s, col, value);
}

function isDateColumn(col: string): boolean {
  return DATE_COLUMNS.has(col);
}

function buildRowRecord(s: EditableShipment): Record<string, string> {
  const rec: Record<string, string> = {};
  for (const col of COLUMNS) {
    rec[col] = getCellValueFn(s, col);
  }
  // Include extra fields (e.g. Linked Quote, Sales number) not in COLUMNS
  if (s.extra) {
    for (const [key, val] of Object.entries(s.extra)) {
      if (val && !rec[key]) rec[key] = val;
    }
  }
  return rec;
}

// ─── Sub-components ─────────────────────────────────────────────────

function DropdownEditor({
  value,
  options,
  onChange,
  onClose,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <select
      ref={ref}
      value={value}
      onChange={(e) => {
        if (e.target.value !== "---") {
          onChange(e.target.value);
        }
      }}
      onBlur={onClose}
      className="w-full bg-[hsl(222,47%,12%)] text-[hsl(210,40%,96%)] border border-[hsl(217,33%,25%)] rounded text-[11px] px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
      style={{ minWidth: "60px" }}
      data-testid="cell-dropdown"
    >
      <option value="">—</option>
      {options.map((opt) =>
        opt === "---" ? (
          <option key="separator" disabled value="---">
            ───────────
          </option>
        ) : (
          <option key={opt} value={opt}>
            {opt}
          </option>
        )
      )}
    </select>
  );
}

function TextEditor({
  value,
  placeholder,
  onChange,
  onClose,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      value={localVal}
      placeholder={placeholder}
      onChange={(e) => setLocalVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onChange(localVal);
        }
        if (e.key === "Escape") {
          onClose();
        }
      }}
      onBlur={() => {
        onChange(localVal);
      }}
      className="w-full bg-[hsl(222,47%,12%)] text-[hsl(210,40%,96%)] border border-[hsl(217,33%,25%)] rounded text-[11px] px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
      style={{ minWidth: "60px" }}
      data-testid="cell-text-input"
    />
  );
}

function CheckboxEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const checked = value === "true" || value === "1" || value === "yes";
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked ? "true" : "false")}
      className="accent-[var(--brand-teal)] w-3.5 h-3.5 cursor-pointer"
      data-testid="cell-checkbox"
    />
  );
}

// ─── Filter popover component ────────────────────────────────────────

function FilterPopover({
  col,
  allValues,
  filter,
  colType,
  onApply,
  onClear,
  onClose,
  portalPos,
}: {
  col: string;
  allValues: string[];
  filter: ColumnFilter | undefined;
  colType: ColumnType;
  onApply: (f: ColumnFilter) => void;
  onClear: () => void;
  onClose: () => void;
  portalPos: { top: number; left: number };
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const isDropdown = colType === "dropdown";
  const uniqueValues = useMemo(() => {
    const set = new Set(allValues.filter(Boolean));
    return Array.from(set).sort();
  }, [allValues]);

  const [textVal, setTextVal] = useState(filter?.textValue || "");
  const [selected, setSelected] = useState<Set<string>>(
    filter?.selectedValues ? new Set(filter.selectedValues) : new Set(uniqueValues)
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const toggleValue = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(uniqueValues));
  const selectNone = () => setSelected(new Set());

  return (
    <div
      ref={popRef}
      className="fixed z-[9999] rounded-md border border-[hsl(217,33%,25%)] shadow-lg"
      style={{ background: "hsl(222, 47%, 10%)", minWidth: "180px", maxHeight: "300px", top: portalPos.top, left: portalPos.left }}
      data-testid={`filter-popover-${col}`}
    >
      {isDropdown ? (
        <div className="p-2 space-y-1">
          <div className="flex gap-1 mb-1">
            <button onClick={selectAll} className="text-[10px] text-[var(--brand-teal)] hover:underline">All</button>
            <span className="text-[10px] text-[hsl(215,20%,55%)]">|</span>
            <button onClick={selectNone} className="text-[10px] text-[var(--brand-teal)] hover:underline">None</button>
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {uniqueValues.map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-[11px] text-[hsl(210,40%,96%)] cursor-pointer hover:bg-white/5 px-1 py-0.5 rounded">
                <input
                  type="checkbox"
                  checked={selected.has(v)}
                  onChange={() => toggleValue(v)}
                  className="accent-[var(--brand-teal)] w-3 h-3"
                />
                <span className="truncate">{v}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-1 pt-1 border-t border-[hsl(217,33%,20%)]">
            <button
              onClick={() => onApply({ type: "values", selectedValues: selected })}
              className="flex-1 text-[10px] font-medium bg-[var(--brand-teal)] text-white rounded px-2 py-1 hover:bg-[var(--brand-teal-strong)]"
            >
              Apply
            </button>
            <button
              onClick={onClear}
              className="text-[10px] text-[hsl(215,20%,55%)] hover:text-white px-2 py-1"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2 space-y-1">
          <input
            type="text"
            value={textVal}
            onChange={(e) => setTextVal(e.target.value)}
            placeholder="Contains..."
            className="w-full bg-[hsl(222,47%,12%)] text-[hsl(210,40%,96%)] border border-[hsl(217,33%,25%)] rounded text-[11px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onApply({ type: "text", textValue: textVal });
              }
            }}
            data-testid={`filter-text-${col}`}
          />
          <div className="flex gap-1 pt-1">
            <button
              onClick={() => onApply({ type: "text", textValue: textVal })}
              className="flex-1 text-[10px] font-medium bg-[var(--brand-teal)] text-white rounded px-2 py-1 hover:bg-[var(--brand-teal-strong)]"
            >
              Apply
            </button>
            <button
              onClick={onClear}
              className="text-[10px] text-[hsl(215,20%,55%)] hover:text-white px-2 py-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Freeze context menu ─────────────────────────────────────────────

function FreezeContextMenu({
  x,
  y,
  col,
  colIndex,
  freezeCount,
  onFreeze,
  onUnfreeze,
  onClose,
}: {
  x: number;
  y: number;
  col: string;
  colIndex: number;
  freezeCount: number;
  onFreeze: () => void;
  onUnfreeze: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isThisColFrozen = colIndex < freezeCount;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] rounded-md border border-[hsl(217,33%,25%)] shadow-xl py-1"
      style={{ left: x, top: y, background: "hsl(222, 47%, 10%)", minWidth: "200px" }}
    >
      {/* Always show freeze option — it changes the freeze point */}
      <button
        onClick={() => { onFreeze(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[hsl(210,40%,96%)] hover:bg-white/10 transition-colors text-left"
        data-testid="ctx-freeze"
      >
        <Lock className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
        Freeze up to “{col}”
      </button>
      {/* Show unfreeze only if something is frozen */}
      {freezeCount > 0 && (
        <button
          onClick={() => { onUnfreeze(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[hsl(210,40%,96%)] hover:bg-white/10 transition-colors text-left"
          data-testid="ctx-unfreeze"
        >
          <Unlock className="w-3.5 h-3.5 text-[hsl(215,20%,55%)]" />
          Unfreeze all columns
        </button>
      )}
    </div>
  );
}

// ─── Shared cell renderer ────────────────────────────────────────────

function CellContent({
  s,
  col,
  rowRecord,
  editingCell,
  startEditing,
  commitEdit,
  cancelEdit,
  onJobNumberClick,
  onMasterJobClick,
  onRemoveMasterJob,
  onOpenDimensions,
}: {
  s: EditableShipment;
  col: string;
  rowRecord: Record<string, string>;
  editingCell: EditingCell | null;
  startEditing: (rowId: string, col: string) => void;
  commitEdit: (rowId: string, col: string, value: string) => void;
  cancelEdit: () => void;
  onJobNumberClick?: (jobNumber: string) => void;
  onMasterJobClick?: (masterNumber: string) => void;
  onRemoveMasterJob?: (jobNumber: string) => void;
  onOpenDimensions?: (rowId: string) => void;
}) {
  let val = getCellValueFn(s, col);
  // Auto-calculate Weight Measure = MAX(Weight/1000, CBM)
  // ─── Computed columns ─────────────────────────────────────────
  // Dimensions are stored as JSON in extra["_dimensions"] (see DimensionsPopup)
  const dimensionsJson = rowRecord["_dimensions"] || "";
  let dimsTotalWeightKg = 0; // kg
  let dimsTotalVolumeCbm = 0; // cbm
  let dimsTotalSurface = 0; // sq meters
  if (dimensionsJson) {
    try {
      const rows = JSON.parse(dimensionsJson) as Array<{ colli?: string; length?: string; width?: string; height?: string; weightPerPiece?: string; volumePerPiece?: string; }>;
      for (const r of rows) {
        const colli = parseFloat(r.colli || "0") || 0;
        const L = parseFloat(r.length || "0") || 0;
        const W = parseFloat(r.width || "0") || 0;
        const H = parseFloat(r.height || "0") || 0;
        const wPiece = parseFloat(r.weightPerPiece || "0") || 0;
        const vPiece = r.volumePerPiece ? parseFloat(r.volumePerPiece) : (L * W * H) / 1_000_000;
        dimsTotalWeightKg += colli * wPiece;
        dimsTotalVolumeCbm += colli * (isNaN(vPiece) ? 0 : vPiece);
        dimsTotalSurface += colli * (L * W) / 10_000; // cm² → m²
      }
    } catch { /* ignore malformed */ }
  }

  // Total Weight In Tons (R) — computed from Dimensions or manual override
  if (col === "Total Weight In Tons") {
    const manual = rowRecord["Total Weight In Tons"] || "";
    if (dimsTotalWeightKg > 0) val = (dimsTotalWeightKg / 1000).toFixed(3);
    else val = manual;
  }
  // Total Volume In CBM (S)
  if (col === "Total Volume In CBM") {
    const manual = rowRecord["Total Volume In CBM"] || "";
    if (dimsTotalVolumeCbm > 0) val = dimsTotalVolumeCbm.toFixed(3);
    else val = manual;
  }
  // Surface (T)
  if (col === "Surface") {
    if (dimsTotalSurface > 0) val = dimsTotalSurface.toFixed(2);
  }
  // Freight Ton (renamed from Weight Measure) = MAX(Weight/1000, CBM)
  if (col === "Freight Ton") {
    const weightTons = dimsTotalWeightKg > 0 ? dimsTotalWeightKg / 1000 : (parseFloat(rowRecord["Total Weight In Tons"] || "0") || 0);
    const cbm = dimsTotalVolumeCbm > 0 ? dimsTotalVolumeCbm : (parseFloat(rowRecord["Total Volume In CBM"] || "0") || 0);
    const wm = Math.max(weightTons, cbm);
    val = wm > 0 ? wm.toFixed(3) : "";
  }
  // TEU (K) — auto-calculated from container inputs
  if (col === "TEU") {
    let teu = 0;
    for (let i = 1; i <= 4; i++) {
      const count = parseFloat(rowRecord[`Amount Of Containers (${i})`] || "0") || 0;
      const length = parseFloat(rowRecord[`Container's Length (${i})`] || "0") || 0;
      if (count > 0 && length > 0) {
        // 20ft = 1 TEU, 40ft = 2 TEU
        teu += count * (length >= 40 ? 2 : 1);
      }
    }
    val = teu > 0 ? String(teu) : "";
  }
  // Dimensions (L) — show summary "click to open"
  if (col === "Dimensions") {
    if (dimensionsJson) {
      try {
        const rows = JSON.parse(dimensionsJson) as any[];
        const totalColli = rows.reduce((sum, r) => sum + (parseFloat(r.colli || "0") || 0), 0);
        val = totalColli > 0 ? `${totalColli} pcs · click to edit` : "click to open";
      } catch { val = "click to open"; }
    } else {
      val = "";
    }
  }
  const colType = getColumnType(col);
  const isEditing = editingCell?.rowId === s._id && editingCell?.col === col;
  const isStatus = col === "Shipment Status";
  const isDate = isDateColumn(col);
  const isCheckbox = colType === "checkbox";
  const isJobNumber = col === "Internal Reference";
  const isMasterNumber = col === "Master job";
  const hasMasterJob = !!(rowRecord["Master job"] || "").trim();

  const condStyle = getCellConditionalStyle(col, val, rowRecord);
  const cellStyle: React.CSSProperties = condStyle
    ? {
        backgroundColor: condStyle.backgroundColor,
        color: condStyle.color,
        fontWeight: condStyle.fontWeight,
      }
    : {};

  // Job number column special styling
  if (isJobNumber) {
    cellStyle.color = cellStyle.color || "var(--brand-teal)";
  }

  // Master job column styling
  if (isMasterNumber && val) {
    cellStyle.color = "var(--brand-amber)";
  }

  // Light orange highlight for grouped shipments (Job number + Master job cells)
  if (hasMasterJob && (isJobNumber || isMasterNumber)) {
    cellStyle.backgroundColor = "rgba(251, 191, 36, 0.08)";
  }

  return (
    <td
      className={`px-2 whitespace-nowrap text-[11px] cursor-pointer ${
        isDate ? "tabular-nums" : ""
      } ${isJobNumber || isMasterNumber ? "font-mono tabular-nums" : ""}`}
      style={{ ...cellStyle, height: "28px", maxHeight: "28px", lineHeight: "28px", padding: "0 8px", overflow: "hidden", boxSizing: "border-box", width: `${getColumnWidth(col)}px`, minWidth: `${getColumnWidth(col)}px`, maxWidth: `${getColumnWidth(col)}px` }}
      onClick={() => {
        if (isJobNumber && onJobNumberClick && s.jobNumber) {
          onJobNumberClick(s.jobNumber);
        } else if (isMasterNumber && val && onMasterJobClick) {
          onMasterJobClick(val);
        } else if (col === "Dimensions" && onOpenDimensions) {
          onOpenDimensions(s._id);
        } else if (!isCheckbox) {
          startEditing(s._id, col);
        }
      }}
      data-testid={`cell-${s.row}-${col}`}
    >
      {isEditing ? (
        colType === "dropdown" ? (
          <DropdownEditor
            value={val}
            options={(() => {
              const allOpts = DROPDOWN_OPTIONS[col] || [];
              if (col === "Shipment Status") {
                const tradeDir = getCellValueFn(s, "Trade Direction") || "";
                if (tradeDir === "Import") return allOpts.filter(o => o.includes("[IMP]"));
                if (tradeDir === "Export") return allOpts.filter(o => o.includes("[EXP]"));
              }
              return allOpts;
            })()}
            onChange={(v) => commitEdit(s._id, col, v)}
            onClose={cancelEdit}
          />
        ) : (
          <TextEditor
            value={val}
            placeholder={isDate ? "MM/DD/YY" : undefined}
            onChange={(v) => commitEdit(s._id, col, v)}
            onClose={cancelEdit}
          />
        )
      ) : isCheckbox ? (
        <CheckboxEditor
          value={val}
          onChange={(v) => commitEdit(s._id, col, v)}
        />
      ) : isStatus && val ? (
        <span style={getStatusBadgeStyle(val)}>{val}</span>
      ) : isMasterNumber && val ? (
        <span className="flex items-center gap-1" style={{ lineHeight: "28px" }}>
          <span
            className="hover:underline"
            data-testid={`master-link-${s.jobNumber}`}
            title="Click to open master job detail"
          >{val}</span>
          {onRemoveMasterJob && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveMasterJob(s.jobNumber); }}
              className="text-amber-400/40 hover:text-red-400 transition-colors p-0 leading-none flex-none"
              title="Remove from Master Job"
              data-testid={`unlink-master-${s.jobNumber}`}
            >
              <Unlink className="w-3 h-3" />
            </button>
          )}
        </span>
      ) : (
        <span className={val ? "" : "text-muted-foreground/30"}>
          {val || "—"}
        </span>
      )}
    </td>
  );
}

// ─── Constants ──────────────────────────────────────────────────────

const LOCKED_COLUMNS = ["Internal Reference", "Master job"] as const; // permanently first two, cannot be moved
const LOCKED_COLUMN = LOCKED_COLUMNS[0]; // backward compat for some checks

// ─── Main component ─────────────────────────────────────────────────

export function FullSheetTab() {
  const { data, setData, deleteShipment, persistCellEdit } = useShipments();
  const { user: authUser } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);

  // Freeze state: number of columns frozen from the left (0 = none, 1 = first column only, etc.)
  const [freezeCount, setFreezeCount] = useState<number>(2); // default: freeze Job number + Master job

  // Column order state — Job number is always first (locked), rest can be reordered
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [
    ...LOCKED_COLUMNS,
    ...COLUMNS.filter((c) => !LOCKED_COLUMNS.includes(c as any)),
  ]);

  // Drag state for column reordering (pointer-based, no HTML5 DnD API — works inside iframes)
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragSide, setDragSide] = useState<"left" | "right" | null>(null);
  const headerCellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dragStartXRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; col: string; colIndex: number } | null>(null);

  // Delete shipment state
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteJobInput, setDeleteJobInput] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetLabel, setDeleteTargetLabel] = useState("");

  // New shipment dialog state
  type NewShipmentStep = "ask-copy" | "select-fields" | "confirm-costs";
  const [newShipmentDialogOpen, setNewShipmentDialogOpen] = useState(false);
  const [newShipmentStep, setNewShipmentStep] = useState<NewShipmentStep>("ask-copy");
  const [isCreatingShipment, setIsCreatingShipment] = useState(false);
  const [newShipmentJobNumber, setNewShipmentJobNumber] = useState("");
  const [copyFromJob, setCopyFromJob] = useState("");
  const [copyFromDropdownOpen, setCopyFromDropdownOpen] = useState(false);
  const [copyFromSearch, setCopyFromSearch] = useState("");
  const [selectedCopyFields, setSelectedCopyFields] = useState<Set<string>>(new Set(COPYABLE_FIELDS));
  const [copyEstimatedCosts, setCopyEstimatedCosts] = useState(false);
  const copyFromDropdownRef = useRef<HTMLDivElement>(null);

  // Master Job dialog state
  type MasterJobStep = "choose-mode" | "select" | "confirm";
  const [masterJobDialogOpen, setMasterJobDialogOpen] = useState(false);
  const [removeMasterConfirm, setRemoveMasterConfirm] = useState<{ jobNumber: string; mcz: string } | null>(null);
  const [masterJobStep, setMasterJobStep] = useState<MasterJobStep>("choose-mode");
  const [masterJobMode, setMasterJobMode] = useState<"new" | "existing">("new");
  const [masterJobNumber, setMasterJobNumber] = useState("");
  const [masterJobSelected, setMasterJobSelected] = useState<Set<string>>(new Set());
  const [masterJobSearch, setMasterJobSearch] = useState("");
  const [isCreatingMasterJob, setIsCreatingMasterJob] = useState(false);
  const [existingMasterNumbers, setExistingMasterNumbers] = useState<string[]>([]);
  const [selectedExistingMCZ, setSelectedExistingMCZ] = useState("");

  // Chat panel state
  const [chatJobNumber, setChatJobNumber] = useState("");

  // Attachments panel state
  const [attachJobNumber, setAttachJobNumber] = useState("");

  // Master job chat + attachments panel state
  const [masterChatMCZ, setMasterChatMCZ] = useState("");
  const [masterAttachMCZ, setMasterAttachMCZ] = useState("");

  // Shipment detail modal state
  const [detailJobNumber, setDetailJobNumber] = useState("");
  const [detailMasterNumber, setDetailMasterNumber] = useState("");
  const [dimensionsRowId, setDimensionsRowId] = useState<string | null>(null);

  // Refs for synchronized scrolling
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const leftHeaderRef = useRef<HTMLDivElement>(null);
  const rightBodyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // Sync vertical scroll between left and right panes
  const syncScroll = useCallback((source: "left" | "right") => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const srcEl = source === "left" ? leftBodyRef.current : rightBodyRef.current;
    const dstEl = source === "left" ? rightBodyRef.current : leftBodyRef.current;
    if (srcEl && dstEl) {
      dstEl.scrollTop = srcEl.scrollTop;
    }
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, []);

  // Column splits — using the user-reordered column list
  const orderedColumns = columnOrder;
  const frozenCols = useMemo(() => orderedColumns.slice(0, freezeCount), [orderedColumns, freezeCount]);
  const scrollCols = useMemo(() => orderedColumns.slice(freezeCount), [orderedColumns, freezeCount]);

  // ─── Pointer-based column reorder (works inside sandboxed iframes) ──
  const DRAG_THRESHOLD = 5; // px of movement before a drag starts

  const handleColMouseDown = useCallback((e: React.MouseEvent, col: string) => {
    if (LOCKED_COLUMNS.includes(col as any)) return;
    if (e.button !== 0) return; // left-click only
    e.preventDefault();
    dragStartXRef.current = e.clientX;
    isDraggingRef.current = false;
    setDragCol(col);
  }, []);

  // Global mousemove / mouseup while dragging
  useEffect(() => {
    if (!dragCol) return;

    const onMove = (e: MouseEvent) => {
      // Apply threshold before visual feedback kicks in
      if (!isDraggingRef.current) {
        if (Math.abs(e.clientX - dragStartXRef.current) < DRAG_THRESHOLD) return;
        isDraggingRef.current = true;
      }

      // Determine which header cell the pointer is over
      let foundCol: string | null = null;
      let foundSide: "left" | "right" | null = null;
      headerCellRefs.current.forEach((el, colName) => {
        if (LOCKED_COLUMNS.includes(colName as any) || colName === dragCol) return;
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          foundCol = colName;
          const midX = rect.left + rect.width / 2;
          foundSide = e.clientX < midX ? "left" : "right";
        }
      });
      setDragOverCol(foundCol);
      setDragSide(foundSide);
    };

    const onUp = () => {
      if (isDraggingRef.current && dragCol && dragOverCol && dragOverCol !== dragCol && !LOCKED_COLUMNS.includes(dragOverCol as any)) {
        const sourceCol = dragCol;
        const targetCol = dragOverCol;
        const side = dragSide;
        setColumnOrder((prev) => {
          const next = prev.filter((c) => c !== sourceCol);
          let targetIdx = next.indexOf(targetCol);
          if (targetIdx === -1) return prev;
          if (side === "right") targetIdx += 1;
          if (targetIdx < 1) targetIdx = 1;
          next.splice(targetIdx, 0, sourceCol);
          return next;
        });
      }
      setDragCol(null);
      setDragOverCol(null);
      setDragSide(null);
      isDraggingRef.current = false;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragCol, dragOverCol, dragSide]);

  // Unique statuses for toolbar dropdown
  const uniqueStatuses = useMemo(() => {
    const set = new Set(data.map((s) => s.status));
    return Array.from(set).sort();
  }, [data]);

  const getColumnValues = useCallback(
    (col: string): string[] => data.map((s) => getCellValueFn(s, col)),
    [data]
  );

  // Filter logic
  const filteredData = useMemo(() => {
    let result = data;
    if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        for (const col of COLUMNS) {
          const val = getCellValueFn(s, col);
          if (val && val.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    for (const [col, filter] of Object.entries(columnFilters)) {
      if (filter.type === "text" && filter.textValue) {
        const q = filter.textValue.toLowerCase();
        result = result.filter((s) => {
          const val = getCellValueFn(s, col);
          return val.toLowerCase().includes(q);
        });
      } else if (filter.type === "values" && filter.selectedValues) {
        const allowed = filter.selectedValues;
        result = result.filter((s) => {
          const val = getCellValueFn(s, col);
          if (!val) return allowed.size === 0 || allowed.has("");
          return allowed.has(val);
        });
      }
    }
    return result;
  }, [data, search, statusFilter, columnFilters]);

  const activeFilterCount = Object.keys(columnFilters).length;

  const startEditing = useCallback((rowId: string, col: string) => {
    if (col === "Internal Reference" || col === "Master job" || col === "Created by" || col === "Freight Ton" || col === "TEU" || col === "Total Weight In Tons" || col === "Total Volume In CBM" || col === "Surface" || col === "Dimensions") return; // system-generated / popup
    setEditingCell({ rowId, col });
  }, []);

  const commitEdit = useCallback(
    (rowId: string, col: string, value: string) => {
      setData((prev) => {
        const target = prev.find((s) => s._id === rowId);
        if (target) {
          const jobKey = target.jobNumber?.trim() ? target.jobNumber : target._id;
          const oldValue = getColumnValue(target, col);
          persistCellEdit(jobKey, col, value);

          // Automation: fire trigger when Department, Status, or Backup [Vacation] changes
          if ((col === "Department" || col === "Shipment Status" || col === "Holiday Cover") && value !== oldValue && target.jobNumber) {
            // Build shipment data snapshot for date-based rule evaluation
            const rec = buildRowRecord(target);
            apiRequest("POST", "/api/automation/trigger", {
              jobNumber: target.jobNumber,
              column: col,
              oldValue: oldValue || "",
              newValue: value,
              triggeredBy: authUser?.email || "System",
              shipmentData: rec,
            }).catch((err) => console.error("Automation trigger failed:", err));
          }
        }
        return prev.map((s) => (s._id === rowId ? setCellValue(s, col, value) : s));
      });
      setEditingCell(null);
    },
    [persistCellEdit, authUser]
  );

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Generate next sequential job number
  const generateNextJobNumber = useCallback(async () => {
    let maxNum = 0;
    // Scan visible data
    for (const s of data) {
      const jn = s.jobNumber;
      if (jn && jn.startsWith("CZ") && !jn.startsWith("CZQ")) {
        const numPart = parseInt(jn.substring(2), 10);
        if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
      }
    }
    // Also scan ALL edit history (including soft-deleted) to avoid number collisions
    try {
      const editsResp = await apiRequest("GET", "/api/shipment-edits");
      const allEdits: any[] = await editsResp.json();
      for (const edit of allEdits) {
        if (edit.action === "create" && edit.payload) {
          const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
          const jn = p.jobNumber || "";
          if (jn.startsWith("CZ") && !jn.startsWith("CZQ")) {
            const num = parseInt(jn.substring(2), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }
    } catch { /* continue with visible data count */ }
    const next = maxNum + 1;
    return `CZ${String(next).padStart(8, "0")}`;
  }, [data]);

  const openNewShipmentDialog = useCallback(async () => {
    const nextJob = await generateNextJobNumber();
    setNewShipmentJobNumber(nextJob);
    setCopyFromJob("");
    setCopyFromSearch("");
    setSelectedCopyFields(new Set(COPYABLE_FIELDS));
    setCopyEstimatedCosts(false);
    setNewShipmentStep("ask-copy");
    setNewShipmentDialogOpen(true);
  }, [generateNextJobNumber]);

  // Generate creation timestamp in CET/CEST European format
  const makeCreationDate = useCallback(() => {
    const now = new Date();
    const cetStr = now.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const creator = authUser?.email || "System";
    return `${cetStr} — ${creator}`;
  }, [authUser]);

  const createNewShipmentBlank = useCallback(() => {
    const id = genId();
    const newShipment: EditableShipment = {
      row: Date.now(),
      jobNumber: newShipmentJobNumber,
      month: "",
      dept: "Operation Department",
      handler: authUser?.email || "",
      shipper: "",
      consignee: "",
      customsStatus: "Waiting For Commercial Paperwork",
      status: "Booking Confirmation Pending [IMP]",
      shipmentType: "Import",
      fclLcl: "",
      shippingLine: "",
      pol: "",
      pod: "",
      etd: "",
      eta: "",
      etaDepo: "",
      etaCnee: "",
      vessel: "",
      goods: "",
      hsCode: "",
      extra: { "Created by": makeCreationDate() },
      _id: id,
    };
    setData((prev) => [newShipment, ...prev]);
    apiRequest("POST", "/api/shipment-edits", {
      action: "create",
      jobKey: id,
      payload: newShipment,
    }).catch((err) => console.error("Failed to persist new shipment:", err));
    setNewShipmentDialogOpen(false);
  }, [newShipmentJobNumber, makeCreationDate]);

  const createNewShipmentWithCopy = useCallback(async () => {
    const sourceShipment = data.find((s) => s.jobNumber === copyFromJob);
    if (!sourceShipment) return;

    const id = genId();
    let newShipment: EditableShipment = {
      row: Date.now(),
      jobNumber: newShipmentJobNumber,
      month: "",
      dept: "Operation Department",
      handler: authUser?.email || "",
      shipper: "",
      consignee: "",
      customsStatus: "Waiting For Commercial Paperwork",
      status: "Booking Confirmation Pending [IMP]",
      shipmentType: "Import",
      fclLcl: "",
      shippingLine: "",
      pol: "",
      pod: "",
      etd: "",
      eta: "",
      etaDepo: "",
      etaCnee: "",
      vessel: "",
      goods: "",
      hsCode: "",
      extra: { "Created by": makeCreationDate() },
      _id: id,
    };

    // Copy selected fields from source
    for (const field of Array.from(selectedCopyFields)) {
      const val = getColumnValue(sourceShipment, field);
      if (val) {
        newShipment = setCellValue(newShipment, field, val);
      }
    }

    setData((prev) => [newShipment, ...prev]);
    apiRequest("POST", "/api/shipment-edits", {
      action: "create",
      jobKey: id,
      payload: newShipment,
    }).catch((err) => console.error("Failed to persist new shipment:", err));

    // Copy estimated costs if requested
    if (copyEstimatedCosts) {
      try {
        const resp = await apiRequest("GET", `/api/invoicing/${encodeURIComponent(copyFromJob)}`);
        const invData = await resp.json();
        // Copy cost rows
        for (const cost of invData.costs) {
          if (cost.estAmount || cost.estCurrency !== "CZK") {
            await apiRequest("POST", "/api/invoicing/costs", {
              jobNumber: newShipmentJobNumber,
              category: cost.category,
              estAmount: cost.estAmount || "",
              estCurrency: cost.estCurrency || "CZK",
              realAmount: "",
              realCurrency: "CZK",
              invoiceNumber: "",
              vendor: "",
            });
          }
        }
        // Copy additional charges estimated amounts
        for (const ac of invData.additionalCharges) {
          if (ac.estAmount || ac.description) {
            await apiRequest("POST", "/api/invoicing/additional", {
              jobNumber: newShipmentJobNumber,
              description: ac.description || "",
              estAmount: ac.estAmount || "",
              estCurrency: ac.estCurrency || "CZK",
              realAmount: "",
              realCurrency: "CZK",
              invoiceNumber: "",
              vendor: "",
              sortOrder: ac.sortOrder ?? 0,
            });
          }
        }
      } catch (err) {
        console.error("Failed to copy estimated costs:", err);
      }
    }

    setNewShipmentDialogOpen(false);
  }, [data, copyFromJob, newShipmentJobNumber, selectedCopyFields, copyEstimatedCosts]);

  const handleDeleteRequest = useCallback(() => {
    const jn = deleteJobInput.trim();
    if (!jn) return;
    const found = data.find((s) => s.jobNumber === jn);
    if (!found) {
      alert(`No shipment found with Job Number "${jn}"`);
      return;
    }
    setDeleteTargetLabel(`${found.jobNumber} — ${found.shipper || found.consignee || "(no name)"}`);
    setDeleteConfirmOpen(true);
  }, [deleteJobInput, data]);

  const confirmDelete = useCallback(() => {
    const jn = deleteJobInput.trim();
    deleteShipment(jn);
    setDeleteConfirmOpen(false);
    setDeleteJobInput("");
    setDeleteMode(false);
  }, [deleteJobInput, deleteShipment]);

  // ─── Master Job ───────────────────────────────────────────────
  const generateNextMasterNumber = useCallback(async () => {
    let maxNum = 0;
    // Scan visible data
    for (const s of data) {
      const mn = getColumnValue(s, "Master job");
      if (mn && mn.startsWith("MCZ")) {
        const num = parseInt(mn.substring(3), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    // Also scan ALL edit history (including soft-deleted) to avoid collisions
    try {
      const editsResp = await apiRequest("GET", "/api/shipment-edits");
      const allEdits: any[] = await editsResp.json();
      for (const edit of allEdits) {
        if (edit.payload) {
          const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
          // Check the Master job in extra fields
          const mn = p["Master job"] || (p.extra && p.extra["Master job"]) || "";
          if (mn.startsWith("MCZ")) {
            const num = parseInt(mn.substring(3), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }
    } catch { /* continue */ }
    return `MCZ${String(maxNum + 1).padStart(8, "0")}`;
  }, [data]);

  const openMasterJobDialog = useCallback(async () => {
    const nextMCZ = await generateNextMasterNumber();
    setMasterJobNumber(nextMCZ);
    setMasterJobSelected(new Set());
    setMasterJobSearch("");
    setMasterJobMode("new");
    setSelectedExistingMCZ("");
    // Collect ALL MCZ numbers ever used (current data + edit history)
    const mczSet = new Set<string>();
    for (const s of data) {
      const mn = getColumnValue(s, "Master job");
      if (mn && mn.startsWith("MCZ")) mczSet.add(mn);
    }
    // Also scan edit history for MCZ numbers that may no longer have active members
    try {
      const editsResp = await apiRequest("GET", "/api/shipment-edits");
      const allEdits: any[] = await editsResp.json();
      for (const edit of allEdits) {
        if (edit.payload) {
          const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
          const mn = p["Master job"] || "";
          if (mn.startsWith("MCZ")) mczSet.add(mn);
        }
      }
    } catch { /* continue */ }
    setExistingMasterNumbers(Array.from(mczSet).sort());
    setMasterJobStep(mczSet.size > 0 ? "choose-mode" : "select");
    setMasterJobDialogOpen(true);
  }, [generateNextMasterNumber, data]);

  const confirmMasterJob = useCallback(async () => {
    if (isCreatingMasterJob || masterJobSelected.size === 0) return;
    setIsCreatingMasterJob(true);
    try {
      // Write the Master job to each selected shipment
      for (const jobNumber of Array.from(masterJobSelected)) {
        const ship = data.find((s) => s.jobNumber === jobNumber);
        if (ship) {
          persistCellEdit(ship.jobNumber || ship._id, "Master job", masterJobNumber);
        }
      }
      // Update local state
      setData((prev) =>
        prev.map((s) => {
          if (masterJobSelected.has(s.jobNumber)) {
            return { ...s, extra: { ...(s.extra || {}), "Master job": masterJobNumber } };
          }
          return s;
        })
      );
      setMasterJobDialogOpen(false);
    } finally {
      setIsCreatingMasterJob(false);
    }
  }, [isCreatingMasterJob, masterJobSelected, masterJobNumber, data, persistCellEdit]);

  const removeMasterJob = useCallback((jobNumber: string) => {
    const ship = data.find((s) => s.jobNumber === jobNumber);
    if (!ship) return;
    const mcz = getColumnValue(ship, "Master job");
    setRemoveMasterConfirm({ jobNumber, mcz });
  }, [data]);

  const confirmRemoveMasterJob = useCallback(() => {
    if (!removeMasterConfirm) return;
    const { jobNumber } = removeMasterConfirm;
    const ship = data.find((s) => s.jobNumber === jobNumber);
    if (ship) {
      persistCellEdit(ship.jobNumber || ship._id, "Master job", "");
      setData((prev) =>
        prev.map((s) => {
          if (s.jobNumber === jobNumber) {
            return { ...s, extra: { ...(s.extra || {}), "Master job": "" } };
          }
          return s;
        })
      );
    }
    setRemoveMasterConfirm(null);
  }, [removeMasterConfirm, data, persistCellEdit]);

  const clearAllFilters = useCallback(() => {
    setColumnFilters({});
    setOpenFilterCol(null);
  }, []);

  const applyColumnFilter = useCallback((col: string, filter: ColumnFilter) => {
    setColumnFilters((prev) => ({ ...prev, [col]: filter }));
    setOpenFilterCol(null);
  }, []);

  const clearColumnFilter = useCallback((col: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
    setOpenFilterCol(null);
  }, []);

  // Context menu handler for column headers
  const handleHeaderContextMenu = useCallback((e: React.MouseEvent, col: string, colIndex: number) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, col, colIndex });
  }, []);

  // Build header cell for a column (used in both frozen and scroll panes)
  const renderHeaderCell = useCallback((col: string, colIndex: number, isLastFrozen: boolean) => {
    const isLocked = LOCKED_COLUMNS.includes(col as any);
    const isDragging = dragCol === col;
    const isOver = dragOverCol === col && dragCol !== col;
    const dropIndicatorClass = isOver
      ? dragSide === "left"
        ? "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--brand-teal)]"
        : "after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[3px] after:bg-[var(--brand-teal)]"
      : "";

    return (
      <th
        key={col}
        ref={(el) => { if (el) headerCellRefs.current.set(col, el); else headerCellRefs.current.delete(col); }}
        onMouseDown={(e) => handleColMouseDown(e, col)}
        className={`relative text-left px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap border-b border-border/50 text-[11px] select-none ${
          isLastFrozen ? "border-r-2 border-r-[hsl(from_var(--brand-teal)_h_s_l/0.4)]" : ""
        } ${
          isDragging ? "opacity-40" : ""
        } ${
          isLocked ? "" : "cursor-grab active:cursor-grabbing"
        } ${dropIndicatorClass}`}
        style={{ width: `${getColumnWidth(col)}px`, minWidth: `${getColumnWidth(col)}px`, background: "hsl(var(--surface-8))" }}
        onContextMenu={(e) => handleHeaderContextMenu(e, col, colIndex)}
        title={isLocked ? "Locked column (cannot be moved)" : "Drag to reorder · Right-click to freeze/unfreeze"}
        data-testid={`col-header-${col}`}
      >
        <span className="flex items-center gap-1">
          {isLocked ? (
            <Lock className="w-2.5 h-2.5 text-[var(--brand-teal)]/60 inline-block flex-shrink-0" />
          ) : (
            <GripVertical className="w-2.5 h-2.5 text-muted-foreground/30 inline-block flex-shrink-0" />
          )}
          {col}
          {!isLocked && colIndex < freezeCount && colIndex === freezeCount - 1 && (
            <Lock className="w-2.5 h-2.5 text-[var(--brand-teal)]/60 inline-block flex-shrink-0" />
          )}
        </span>
      </th>
    );
  }, [handleHeaderContextMenu, handleColMouseDown, freezeCount, dragCol, dragOverCol, dragSide]);

  // Build filter cell for a column
  const renderFilterCell = useCallback((col: string, isLastFrozen: boolean) => (
    <th
      key={`filter-${col}`}
      className={`px-1 py-1 border-b border-border/50 ${
        isLastFrozen ? "border-r-2 border-r-[hsl(from_var(--brand-teal)_h_s_l/0.4)]" : ""
      }`}
      style={{ width: `${getColumnWidth(col)}px`, minWidth: `${getColumnWidth(col)}px`, background: "hsl(var(--surface-9))" }}
    >
      <FilterButton
        col={col}
        isActive={!!columnFilters[col]}
        isOpen={openFilterCol === col}
        onToggle={() => setOpenFilterCol(openFilterCol === col ? null : col)}
        allValues={getColumnValues(col)}
        filter={columnFilters[col]}
        colType={getColumnType(col)}
        onApply={(f) => applyColumnFilter(col, f)}
        onClear={() => clearColumnFilter(col)}
        onClose={() => setOpenFilterCol(null)}
      />
    </th>
  ), [columnFilters, openFilterCol, getColumnValues, applyColumnFilter, clearColumnFilter]);

  // Precompute row records for all filtered data
  const rowRecords = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const s of filteredData) {
      map.set(s._id, buildRowRecord(s));
    }
    return map;
  }, [filteredData]);

  const hasFrozen = freezeCount > 0;

  return (
    <div className="h-full flex flex-col" data-testid="fullsheet-container">
      {/* Toolbar */}
      <div
        className="flex-none flex items-center gap-3 px-4 py-2 border-b border-border/50"
        style={{ background: "hsl(var(--surface-8))" }}
      >
        <button
          onClick={openNewShipmentDialog}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--brand-teal)] text-white hover:bg-[var(--brand-teal-strong)] transition-colors"
          data-testid="btn-new-shipment"
        >
          <Plus className="w-3.5 h-3.5" />
          New Shipment
        </button>

        {/* Delete Shipment toggle + input */}
        {!deleteMode ? (
          <button
            onClick={() => setDeleteMode(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-red-600/80 text-white hover:bg-red-600 transition-colors"
            data-testid="btn-delete-shipment"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Shipment
          </button>
        ) : (
          <div className="flex items-center gap-1.5" data-testid="delete-shipment-form">
            <input
              type="text"
              placeholder="Enter Job Number..."
              value={deleteJobInput}
              onChange={(e) => setDeleteJobInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleDeleteRequest(); if (e.key === "Escape") { setDeleteMode(false); setDeleteJobInput(""); } }}
              className="w-40 px-2 py-1.5 text-xs rounded-md border border-red-500/50 bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
              autoFocus
              data-testid="delete-job-input"
            />
            <button
              onClick={handleDeleteRequest}
              disabled={!deleteJobInput.trim()}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              data-testid="btn-confirm-delete-job"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
            <button
              onClick={() => { setDeleteMode(false); setDeleteJobInput(""); }}
              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1.5 transition-colors"
              data-testid="btn-cancel-delete"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Add to Master Job button */}
        <button
          onClick={openMasterJobDialog}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 transition-colors"
          data-testid="btn-add-master-job"
        >
          <Layers className="w-3.5 h-3.5" />
          Add to Master Job
        </button>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search shipments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-md border border-border/50 bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="search-clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs rounded-md border border-border/50 bg-background/50 text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          data-testid="status-filter"
        >
          <option value="all">All Statuses</option>
          {uniqueStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Freeze indicator */}
        {hasFrozen && (
          <button
            onClick={() => setFreezeCount(0)}
            className="flex items-center gap-1 text-[11px] text-[var(--brand-teal)]/80 hover:text-[var(--brand-teal)] transition-colors"
            title="Click to unfreeze all columns"
            data-testid="btn-unfreeze"
          >
            <Lock className="w-3 h-3" />
            {freezeCount} frozen
          </button>
        )}

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-[11px] text-[var(--brand-teal)] hover:text-white transition-colors"
            data-testid="btn-clear-all-filters"
          >
            <X className="w-3 h-3" />
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
          </button>
        )}

        <span className="text-xs text-muted-foreground tabular-nums ml-auto">
          {filteredData.length} / {data.length} rows
        </span>
      </div>

      {/* Split-pane table area */}
      <div className="flex-1 flex overflow-hidden" data-testid="split-pane-container">
        {/* ── LEFT FROZEN PANE ── */}
        {hasFrozen && (
          <div className="flex-none flex flex-col border-r-2 border-r-[hsl(from_var(--brand-teal)_h_s_l/0.3)]" style={{ maxWidth: "50%" }}>
            {/* Frozen header — synced horizontally with frozen body */}
            <div ref={leftHeaderRef} className="flex-none overflow-hidden">
              <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: `${frozenCols.reduce((sum, c) => sum + getColumnWidth(c) + (c === "Internal Reference" || c === "Master job" ? 48 : 0), 0)}px` }}>
                <thead>
                  <tr>
                    {frozenCols.map((col, i) => [
                      renderHeaderCell(col, i, i === freezeCount - 1),
                      (col === "Internal Reference" || col === "Master job") && <th key={`${col}-icon1`} style={{ width: "24px", minWidth: "24px" }}></th>,
                      (col === "Internal Reference" || col === "Master job") && <th key={`${col}-icon2`} style={{ width: "24px", minWidth: "24px" }}></th>,
                    ])}
                  </tr>
                  <tr>
                    {frozenCols.map((col, i) => [
                      renderFilterCell(col, i === freezeCount - 1),
                      (col === "Internal Reference" || col === "Master job") && <th key={`${col}-ficon1`} style={{ width: "24px", minWidth: "24px" }}></th>,
                      (col === "Internal Reference" || col === "Master job") && <th key={`${col}-ficon2`} style={{ width: "24px", minWidth: "24px" }}></th>,
                    ])}
                  </tr>
                </thead>
              </table>
            </div>

            {/* Frozen body — vertical scrollbar hidden, synced by right pane */}
            <div
              ref={leftBodyRef}
              className="flex-1 overflow-x-auto overflow-y-scroll hide-scrollbar"
              style={{ overscrollBehavior: "contain" }}
              onScroll={(e) => {
                syncScroll("left");
                // Sync left header horizontal scroll
                if (leftHeaderRef.current) {
                  leftHeaderRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                }
              }}
            >
              <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: `${frozenCols.reduce((sum, c) => sum + getColumnWidth(c) + (c === "Internal Reference" || c === "Master job" ? 48 : 0), 0)}px` }}>
                <tbody>
                  {filteredData.map((s) => {
                    const rowRecord = rowRecords.get(s._id)!;
                    const rowBg = getRowBackground(s, rowRecord);

                    return (
                      <tr
                        key={s._id}
                        className="border-b border-border/20 hover:bg-white/[0.02] transition-colors"
                        style={{ background: rowBg, height: "28px" }}
                      >
                        {/* Frozen cols with interleaved icons: Job number → job icons → Master job → master icons → rest */}
                        {frozenCols.map((col) => {
                          const mcz = getColumnValue(s, "Master job");
                          return [
                            <CellContent
                              key={col}
                              s={s}
                              col={col}
                              rowRecord={rowRecord}
                              editingCell={editingCell}
                              startEditing={startEditing}
                              commitEdit={commitEdit}
                              cancelEdit={cancelEdit}
                              onJobNumberClick={(jn) => setDetailJobNumber(jn)}
                              onMasterJobClick={(m) => setDetailMasterNumber(m)}
                              onRemoveMasterJob={removeMasterJob}
                              onOpenDimensions={(rid) => setDimensionsRowId(rid)}
                            />,
                            // After "Internal Reference" → job chat + job attach
                            col === "Internal Reference" && (
                              <td key="jn-chat" className="px-0 text-center cursor-pointer" style={{ width: "24px", minWidth: "24px", maxWidth: "24px", height: "28px" }}
                                onClick={() => { setChatJobNumber((prev) => prev === s.jobNumber ? "" : s.jobNumber); setAttachJobNumber(""); setMasterChatMCZ(""); setMasterAttachMCZ(""); }}
                                title="Chat" data-testid={`chat-icon-${s.jobNumber}`}>
                                <MessageSquare className="w-3 h-3 mx-auto transition-colors" style={{ color: chatJobNumber === s.jobNumber ? "var(--brand-teal)" : "hsl(var(--muted-35))" }} />
                              </td>
                            ),
                            col === "Internal Reference" && (
                              <td key="jn-attach" className="px-0 text-center cursor-pointer" style={{ width: "24px", minWidth: "24px", maxWidth: "24px", height: "28px" }}
                                onClick={() => { setAttachJobNumber((prev) => prev === s.jobNumber ? "" : s.jobNumber); setChatJobNumber(""); setMasterChatMCZ(""); setMasterAttachMCZ(""); }}
                                title="Attachments" data-testid={`attach-icon-${s.jobNumber}`}>
                                <Paperclip className="w-3 h-3 mx-auto transition-colors" style={{ color: attachJobNumber === s.jobNumber ? "var(--brand-teal)" : "hsl(var(--muted-35))" }} />
                              </td>
                            ),
                            // After "Master job" → master chat + master attach
                            col === "Master job" && (
                              <td key="mj-chat" className="px-0 text-center cursor-pointer" style={{ width: "24px", minWidth: "24px", maxWidth: "24px", height: "28px" }}
                                onClick={() => { if (mcz) { setMasterChatMCZ((prev) => prev === mcz ? "" : mcz); setChatJobNumber(""); setAttachJobNumber(""); setMasterAttachMCZ(""); } }}
                                title={mcz ? `Master Chat (${mcz})` : "No Master job"} data-testid={`master-chat-icon-${s.jobNumber}`}>
                                <MessageSquare className="w-3 h-3 mx-auto transition-colors" style={{ color: mcz && masterChatMCZ === mcz ? "var(--brand-amber)" : mcz ? "hsl(var(--muted-30))" : "hsl(var(--muted-15))" }} />
                              </td>
                            ),
                            col === "Master job" && (
                              <td key="mj-attach" className="px-0 text-center cursor-pointer" style={{ width: "24px", minWidth: "24px", maxWidth: "24px", height: "28px" }}
                                onClick={() => { if (mcz) { setMasterAttachMCZ((prev) => prev === mcz ? "" : mcz); setChatJobNumber(""); setAttachJobNumber(""); setMasterChatMCZ(""); } }}
                                title={mcz ? `Master Attachments (${mcz})` : "No Master job"} data-testid={`master-attach-icon-${s.jobNumber}`}>
                                <Paperclip className="w-3 h-3 mx-auto transition-colors" style={{ color: mcz && masterAttachMCZ === mcz ? "var(--brand-amber)" : mcz ? "hsl(var(--muted-30))" : "hsl(var(--muted-15))" }} />
                              </td>
                            ),
                          ];
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RIGHT SCROLLABLE PANE ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Scroll header */}
          <div className="flex-none overflow-hidden" id="right-header-scroll">
            <div className="overflow-x-auto" style={{ overflowY: "hidden" }}
              onScroll={(e) => {
                // Sync header and body horizontal scroll
                const bodyEl = rightBodyRef.current;
                if (bodyEl) {
                  bodyEl.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                }
              }}
            >
              <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: `${scrollCols.reduce((sum, c) => sum + getColumnWidth(c), 0)}px` }}>
                <thead>
                  <tr>
                    {scrollCols.map((col) => {
                      const globalIndex = orderedColumns.indexOf(col);
                      return renderHeaderCell(col, globalIndex, false);
                    })}
                  </tr>
                  <tr>
                    {scrollCols.map((col) => renderFilterCell(col, false))}
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          {/* Scroll body */}
          <div
            ref={rightBodyRef}
            className="flex-1 overflow-auto"
            style={{ overscrollBehavior: "contain" }}
            onScroll={(e) => {
              syncScroll("right");
              // Sync horizontal scroll with the header
              const headerEl = document.getElementById("right-header-scroll")?.firstElementChild as HTMLElement;
              if (headerEl) {
                headerEl.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
              }
            }}
          >
            <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: `${scrollCols.reduce((sum, c) => sum + getColumnWidth(c), 0)}px` }}>
              <tbody>
                {filteredData.map((s) => {
                  const rowRecord = rowRecords.get(s._id)!;
                  const rowBg = getRowBackground(s, rowRecord);

                  return (
                    <tr
                      key={s._id}
                      className="border-b border-border/20 hover:bg-white/[0.02] transition-colors"
                      style={{ background: rowBg, height: "28px" }}
                      data-testid={`sheet-row-${s.row}`}
                    >
                      {scrollCols.map((col) => (
                        <CellContent
                          key={col}
                          s={s}
                          col={col}
                          rowRecord={rowRecord}
                          editingCell={editingCell}
                          startEditing={startEditing}
                          commitEdit={commitEdit}
                          cancelEdit={cancelEdit}
                          onMasterJobClick={(m) => setDetailMasterNumber(m)}
                          onRemoveMasterJob={removeMasterJob}
                          onOpenDimensions={(rid) => setDimensionsRowId(rid)}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chat Panel */}
        {chatJobNumber && (
          <ChatPanel
            jobNumber={chatJobNumber}
            shipperName={data.find((s) => s.jobNumber === chatJobNumber)?.shipper}
            consigneeName={data.find((s) => s.jobNumber === chatJobNumber)?.consignee}
            authorName={authUser?.displayName || authUser?.email || "User"}
            onClose={() => setChatJobNumber("")}
          />
        )}

        {/* Attachments Panel */}
        {attachJobNumber && (
          <AttachmentsPanel
            jobNumber={attachJobNumber}
            shipperName={data.find((s) => s.jobNumber === attachJobNumber)?.shipper}
            consigneeName={data.find((s) => s.jobNumber === attachJobNumber)?.consignee}
            onClose={() => setAttachJobNumber("")}
          />
        )}

        {/* Master Job Chat Panel */}
        {masterChatMCZ && (
          <ChatPanel
            jobNumber={masterChatMCZ}
            shipperName={`Master Job`}
            consigneeName={`${data.filter((s) => getColumnValue(s, "Master job") === masterChatMCZ).length} shipments`}
            authorName={authUser?.displayName || authUser?.email || "User"}
            onClose={() => setMasterChatMCZ("")}
          />
        )}

        {/* Master Job Attachments Panel */}
        {masterAttachMCZ && (
          <AttachmentsPanel
            jobNumber={masterAttachMCZ}
            shipperName={`Master Job`}
            consigneeName={`${data.filter((s) => getColumnValue(s, "Master job") === masterAttachMCZ).length} shipments`}
            onClose={() => setMasterAttachMCZ("")}
          />
        )}
      </div>

      {/* Context menu for freeze/unfreeze */}
      {ctxMenu && (
        <FreezeContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          col={ctxMenu.col}
          colIndex={ctxMenu.colIndex}
          freezeCount={freezeCount}
          onFreeze={() => setFreezeCount(ctxMenu.colIndex + 1)}
          onUnfreeze={() => setFreezeCount(0)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* New Shipment dialog */}
      {newShipmentDialogOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setNewShipmentDialogOpen(false)}
          data-testid="new-shipment-overlay"
        >
          <div
            className="rounded-lg p-6 shadow-2xl max-w-md w-full mx-4"
            style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--surface-20))" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="new-shipment-dialog"
          >
            {/* Step 1: Ask copy */}
            {newShipmentStep === "ask-copy" && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--brand-teal)]/20">
                    <Plus className="w-5 h-5 text-[var(--brand-teal)]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">New Shipment</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Job Number: <span className="font-mono font-medium text-[var(--brand-teal)]">{newShipmentJobNumber}</span></p>
                  </div>
                </div>

                <p className="text-xs text-foreground/80 mb-4">
                  Would you like to copy data from a previous shipment?
                </p>

                {/* Copy from job selector */}
                <div className="mb-4" ref={copyFromDropdownRef}>
                  <label className="block text-[11px] text-muted-foreground mb-1">Copy from Job Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={copyFromDropdownOpen ? copyFromSearch : copyFromJob}
                      placeholder="Search or select..."
                      onChange={(e) => { setCopyFromSearch(e.target.value); if (!copyFromDropdownOpen) setCopyFromDropdownOpen(true); }}
                      onFocus={() => setCopyFromDropdownOpen(true)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-border/50 bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
                      data-testid="copy-from-input"
                    />
                    {copyFromDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border/50 shadow-xl overflow-y-auto max-h-40" style={{ background: "hsl(var(--surface-11))" }}>
                        {data.map((s) => s.jobNumber).filter((jn) => jn && (!copyFromSearch || jn.toLowerCase().includes(copyFromSearch.toLowerCase())))
                          .map((jn) => (
                            <button
                              key={jn}
                              onClick={() => { setCopyFromJob(jn); setCopyFromDropdownOpen(false); setCopyFromSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2 ${jn === copyFromJob ? "text-[var(--brand-teal)]" : "text-foreground"}`}
                              data-testid={`copy-job-opt-${jn}`}
                            >
                              {jn === copyFromJob && <Check className="w-3 h-3" />}
                              <span className={jn === copyFromJob ? "" : "ml-5"}>{jn}</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setNewShipmentDialogOpen(false)}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    data-testid="btn-cancel-new"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isCreatingShipment}
                    onClick={() => { if (!isCreatingShipment) { setIsCreatingShipment(true); createNewShipmentBlank(); setIsCreatingShipment(false); } }}
                    className={`text-xs px-4 py-2 rounded-md border border-border/50 transition-colors ${isCreatingShipment ? "text-foreground/50 cursor-not-allowed" : "text-foreground hover:bg-white/5"}`}
                    data-testid="btn-create-blank"
                  >
                    Create Blank
                  </button>
                  {copyFromJob && (
                    <button
                      onClick={() => setNewShipmentStep("select-fields")}
                      className="text-xs px-4 py-2 rounded-md bg-[var(--brand-teal)] text-white font-medium hover:bg-[var(--brand-teal-strong)] transition-colors"
                      data-testid="btn-next-fields"
                    >
                      Next — Select Fields
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Select fields to copy */}
            {newShipmentStep === "select-fields" && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--brand-teal)]/20">
                    <Copy className="w-5 h-5 text-[var(--brand-teal)]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Select Fields to Copy</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">From <span className="font-mono text-[var(--brand-teal)]">{copyFromJob}</span> → <span className="font-mono text-[var(--brand-teal)]">{newShipmentJobNumber}</span></p>
                  </div>
                </div>

                <div className="space-y-1 mb-4 max-h-64 overflow-y-auto">
                  {/* Select all / deselect all */}
                  <div className="flex gap-2 mb-2 pb-2 border-b border-border/20">
                    <button
                      onClick={() => setSelectedCopyFields(new Set(COPYABLE_FIELDS))}
                      className="text-[10px] text-[var(--brand-teal)] hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedCopyFields(new Set())}
                      className="text-[10px] text-muted-foreground hover:underline"
                    >
                      Deselect All
                    </button>
                  </div>

                  {COPYABLE_FIELDS.map((field) => {
                    const sourceShipment = data.find((s) => s.jobNumber === copyFromJob);
                    const val = sourceShipment ? getColumnValue(sourceShipment, field) : "";
                    const checked = selectedCopyFields.has(field);
                    return (
                      <div
                        key={field}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/[0.03] transition-colors"
                        onClick={() => {
                          setSelectedCopyFields((prev) => {
                            const next = new Set(prev);
                            if (next.has(field)) next.delete(field); else next.add(field);
                            return next;
                          });
                        }}
                        data-testid={`copy-field-${field}`}
                      >
                        <div
                          className="w-4 h-4 rounded border flex items-center justify-center flex-none transition-all"
                          style={{
                            borderColor: checked ? "var(--brand-teal)" : "hsl(var(--border-30))",
                            background: checked ? "var(--brand-teal)" : "transparent",
                          }}
                        >
                          {checked && <Check className="w-2.5 h-2.5 text-black" />}
                        </div>
                        <span className="text-xs text-foreground/80 w-36">{field}</span>
                        <span className="text-xs font-mono text-muted-foreground truncate">{val || <span className="italic text-muted-foreground/30">empty</span>}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setNewShipmentStep("ask-copy")}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    data-testid="btn-back-copy"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setNewShipmentStep("confirm-costs")}
                    disabled={selectedCopyFields.size === 0}
                    className="text-xs px-4 py-2 rounded-md bg-[var(--brand-teal)] text-white font-medium hover:bg-[var(--brand-teal-strong)] transition-colors disabled:opacity-40"
                    data-testid="btn-next-costs"
                  >
                    Next — Estimated Costs
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm estimated costs copy */}
            {newShipmentStep === "confirm-costs" && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--brand-teal)]/20">
                    <Copy className="w-5 h-5 text-[var(--brand-teal)]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Copy Estimated Costs?</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">From <span className="font-mono text-[var(--brand-teal)]">{copyFromJob}</span> to Invoicing</p>
                  </div>
                </div>

                <p className="text-xs text-foreground/80 mb-4">
                  Would you like to also copy the estimated costs from <strong className="text-foreground">{copyFromJob}</strong> to the Invoicing tab of the new shipment?
                </p>

                <div
                  className="flex items-center gap-3 px-3 py-3 rounded-md cursor-pointer hover:bg-white/[0.03] transition-colors border border-border/30 mb-4"
                  onClick={() => setCopyEstimatedCosts(!copyEstimatedCosts)}
                  data-testid="toggle-copy-costs"
                >
                  <div
                    className="w-5 h-5 rounded border flex items-center justify-center flex-none transition-all"
                    style={{
                      borderColor: copyEstimatedCosts ? "var(--brand-teal)" : "hsl(var(--border-30))",
                      background: copyEstimatedCosts ? "var(--brand-teal)" : "transparent",
                    }}
                  >
                    {copyEstimatedCosts && <Check className="w-3 h-3 text-black" />}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-foreground">Yes, copy estimated costs</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Estimated amounts will be copied to the new shipment's Invoicing tab</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setNewShipmentStep("select-fields")}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    data-testid="btn-back-fields"
                  >
                    Back
                  </button>
                  <button
                    disabled={isCreatingShipment}
                    onClick={async () => {
                      if (isCreatingShipment) return;
                      setIsCreatingShipment(true);
                      try { await createNewShipmentWithCopy(); } finally { setIsCreatingShipment(false); }
                    }}
                    className={`text-xs px-4 py-2 rounded-md font-medium transition-colors ${isCreatingShipment ? "bg-[var(--brand-teal)]/50 text-white/50 cursor-not-allowed" : "bg-[var(--brand-teal)] text-white hover:bg-[var(--brand-teal-strong)]"}`}
                    data-testid="btn-create-with-copy"
                  >
                    {isCreatingShipment ? "Creating..." : "Create Shipment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Remove from Master Job confirmation */}
      {removeMasterConfirm && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setRemoveMasterConfirm(null); }}
        >
          <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ background: "hsl(var(--surface-8))", border: "1px solid hsl(var(--border-20))" }}>
            <div className="flex items-center gap-3 px-6 pt-5 pb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: "rgba(251, 191, 36, 0.15)" }}>
                <Unlink className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Remove from Master Job</h3>
                <p className="text-xs text-muted-foreground mt-0.5">This will unlink the shipment</p>
              </div>
            </div>
            <div className="px-6 pb-5">
              <p className="text-xs text-foreground/80 mb-4">
                Are you sure you want to remove <strong className="text-[var(--brand-teal)] font-mono">{removeMasterConfirm.jobNumber}</strong> from Master Job <strong className="text-amber-400 font-mono">{removeMasterConfirm.mcz}</strong>?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRemoveMasterConfirm(null)}
                  className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveMasterJob}
                  className="text-xs px-4 py-2 rounded-md bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors"
                  data-testid="btn-confirm-remove-master"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Master Job dialog */}
      {masterJobDialogOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setMasterJobDialogOpen(false); }}
          data-testid="master-job-dialog"
        >
          <div className="w-full max-w-lg rounded-xl overflow-hidden" style={{ background: "hsl(var(--surface-8))", border: "1px solid hsl(var(--border-20))" }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 pt-5 pb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: "rgba(251, 191, 36, 0.15)" }}>
                <Layers className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Add to Master Job</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Master Number: <span className="font-mono font-medium text-amber-400">{masterJobNumber}</span></p>
              </div>
              <button onClick={() => setMasterJobDialogOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {masterJobStep === "choose-mode" && (
              <div className="px-6 pb-5">
                <p className="text-xs text-muted-foreground mb-4">How would you like to proceed?</p>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setMasterJobMode("new");
                      setMasterJobStep("select");
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-white/[0.03]"
                    style={{ border: "1px solid hsl(var(--border-20))" }}
                    data-testid="btn-master-new"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full flex-none" style={{ background: "var(--brand-teal-soft)" }}>
                      <Plus className="w-4 h-4 text-[var(--brand-teal)]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Create new Master Job</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">New number: <span className="font-mono text-amber-400">{masterJobNumber}</span></p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setMasterJobMode("existing");
                      if (existingMasterNumbers.length > 0 && !selectedExistingMCZ) {
                        setSelectedExistingMCZ(existingMasterNumbers[0]);
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-white/[0.03] ${masterJobMode === "existing" ? "ring-1 ring-amber-500/50" : ""}`}
                    style={{ border: "1px solid hsl(var(--border-20))" }}
                    data-testid="btn-master-existing"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full flex-none" style={{ background: "rgba(251, 191, 36, 0.15)" }}>
                      <Layers className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Add to existing Master Job</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{existingMasterNumbers.length} existing Master Job{existingMasterNumbers.length !== 1 ? "s" : ""}</p>
                    </div>
                  </button>
                </div>

                {/* Existing MCZ selection */}
                {masterJobMode === "existing" && (
                  <div className="mt-3 rounded-lg p-3" style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--border-18))" }}>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Select Master Job</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {existingMasterNumbers.map((mcz) => {
                        const memberCount = data.filter((s) => getColumnValue(s, "Master job") === mcz).length;
                        return (
                          <label
                            key={mcz}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                              selectedExistingMCZ === mcz ? "bg-amber-500/10 ring-1 ring-amber-500/30" : "hover:bg-white/[0.03]"
                            }`}
                            data-testid={`existing-mcz-${mcz}`}
                          >
                            <input
                              type="radio"
                              name="existing-mcz"
                              checked={selectedExistingMCZ === mcz}
                              onChange={() => setSelectedExistingMCZ(mcz)}
                              className="accent-amber-500 w-3.5 h-3.5 flex-none"
                            />
                            <span className="font-mono text-amber-400 font-medium">{mcz}</span>
                            <span className="text-muted-foreground">({memberCount} shipment{memberCount !== 1 ? "s" : ""})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setMasterJobDialogOpen(false)}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (masterJobMode === "existing" && selectedExistingMCZ) {
                        setMasterJobNumber(selectedExistingMCZ);
                      }
                      setMasterJobStep("select");
                    }}
                    disabled={masterJobMode === "existing" && !selectedExistingMCZ}
                    className="text-xs px-4 py-2 rounded-md bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    data-testid="btn-master-mode-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {masterJobStep === "select" && (
              <div className="px-6 pb-5">
                <p className="text-xs text-muted-foreground mb-3">Select shipments to group under this Master Job:</p>
                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Search by Job number, Shipper, Consignee..."
                    value={masterJobSearch}
                    onChange={(e) => setMasterJobSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border/50 bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                    data-testid="master-job-search"
                  />
                </div>
                {/* Job list with checkboxes */}
                <div className="max-h-64 overflow-y-auto rounded-lg" style={{ border: "1px solid hsl(var(--border-18))" }}>
                  {data
                    .filter((s) => {
                      if (!s.jobNumber || s.jobNumber.startsWith("CZQ")) return false;
                      const q = masterJobSearch.toLowerCase();
                      if (!q) return true;
                      return (
                        s.jobNumber.toLowerCase().includes(q) ||
                        (s.shipper || "").toLowerCase().includes(q) ||
                        (s.consignee || "").toLowerCase().includes(q) ||
                        getColumnValue(s, "Master job").toLowerCase().includes(q)
                      );
                    })
                    .map((s) => {
                      const isChecked = masterJobSelected.has(s.jobNumber);
                      const existingMaster = getColumnValue(s, "Master job");
                      return (
                        <label
                          key={s.jobNumber}
                          className={`flex items-center gap-3 px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-white/[0.03] border-b last:border-b-0 ${
                            isChecked ? "bg-amber-500/5" : ""
                          }`}
                          style={{ borderColor: "hsl(var(--border-15))" }}
                          data-testid={`master-job-item-${s.jobNumber}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setMasterJobSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.jobNumber)) next.delete(s.jobNumber);
                                else next.add(s.jobNumber);
                                return next;
                              });
                            }}
                            className="accent-amber-500 w-3.5 h-3.5 flex-none"
                          />
                          <span className="font-mono text-[var(--brand-teal)] font-medium flex-none" style={{ width: "100px" }}>{s.jobNumber}</span>
                          <span className="text-foreground/70 truncate flex-1">
                            {s.shipper || s.consignee || "—"}
                          </span>
                          {existingMaster && (
                            <span className="text-amber-400/60 text-[10px] font-mono flex-none">{existingMaster}</span>
                          )}
                        </label>
                      );
                    })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {masterJobSelected.size} shipment{masterJobSelected.size !== 1 ? "s" : ""} selected
                </p>
                {/* Buttons */}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => existingMasterNumbers.length > 0 ? setMasterJobStep("choose-mode") : setMasterJobDialogOpen(false)}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    {existingMasterNumbers.length > 0 ? "Back" : "Cancel"}
                  </button>
                  <button
                    onClick={() => setMasterJobStep("confirm")}
                    disabled={masterJobSelected.size === 0}
                    className="text-xs px-4 py-2 rounded-md bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    data-testid="btn-master-job-next"
                  >
                    Next — Confirm
                  </button>
                </div>
              </div>
            )}

            {masterJobStep === "confirm" && (
              <div className="px-6 pb-5">
                <p className="text-xs text-foreground/80 mb-3">
                  The following <strong className="text-amber-400">{masterJobSelected.size}</strong> shipment{masterJobSelected.size !== 1 ? "s" : ""} will be linked to <strong className="font-mono text-amber-400">{masterJobNumber}</strong>:
                </p>
                <div className="max-h-40 overflow-y-auto rounded-lg p-3 mb-4" style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--border-18))" }}>
                  {Array.from(masterJobSelected).map((jn) => {
                    const s = data.find((d) => d.jobNumber === jn);
                    return (
                      <div key={jn} className="flex items-center gap-2 py-1 text-xs">
                        <span className="font-mono text-[var(--brand-teal)] font-medium">{jn}</span>
                        <span className="text-foreground/50">—</span>
                        <span className="text-foreground/70 truncate">{s?.shipper || s?.consignee || "—"}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setMasterJobStep("select")}
                    className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    disabled={isCreatingMasterJob}
                    onClick={confirmMasterJob}
                    className={`text-xs px-4 py-2 rounded-md font-medium transition-colors ${isCreatingMasterJob ? "bg-amber-500/50 text-black/50 cursor-not-allowed" : "bg-amber-500 text-black hover:bg-amber-400"}`}
                    data-testid="btn-master-job-confirm"
                  >
                    {isCreatingMasterJob ? "Saving..." : masterJobMode === "existing" ? "Add to Master Job" : "Create Master Job"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setDeleteConfirmOpen(false)}
          data-testid="delete-confirm-overlay"
        >
          <div
            className="rounded-lg p-6 shadow-2xl max-w-sm w-full mx-4"
            style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--surface-20))" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="delete-confirm-dialog"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-600/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Delete Shipment</h3>
                <p className="text-xs text-muted-foreground mt-0.5">The shipment will be hidden but kept in the database</p>
              </div>
            </div>
            <p className="text-xs text-foreground/80 mb-5">
              Are you sure you want to delete shipment <strong className="text-foreground">{deleteTargetLabel}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                data-testid="btn-cancel-confirm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="text-xs px-4 py-2 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                data-testid="btn-final-delete"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Shipment Detail Modal */}
      {detailJobNumber && (() => {
        const s = data.find((d) => d.jobNumber === detailJobNumber);
        if (!s) return null;
        const rec = buildRowRecord(s);
        return (
          <ShipmentDetailModal
            jobNumber={detailJobNumber}
            shipmentData={rec}
            onClose={() => setDetailJobNumber("")}
          />
        );
      })()}

      {/* Master Job detail modal */}
      {detailMasterNumber && (
        <MasterJobDetailModal
          masterNumber={detailMasterNumber}
          onClose={() => setDetailMasterNumber("")}
        />
      )}

      {/* Dimensions popup (task L) */}
      {dimensionsRowId && (() => {
        const target = data.find((d) => d._id === dimensionsRowId);
        if (!target) return null;
        const existing = (target.extra?.["_dimensions"] || "").trim();
        const initialRows: DimensionRow[] = existing ? (() => { try { return JSON.parse(existing); } catch { return [{ colli: "", length: "", width: "", height: "", weightPerPiece: "", volumePerPiece: "", packing: "", stackable: "" }]; } })() : [{ colli: "", length: "", width: "", height: "", weightPerPiece: "", volumePerPiece: "", packing: "", stackable: "" }];
        return (
          <DimensionsPopup
            initialRows={initialRows}
            onClose={() => setDimensionsRowId(null)}
            onSave={(rows) => {
              const json = JSON.stringify(rows);
              const jobKey = target.jobNumber?.trim() ? target.jobNumber : target._id;
              persistCellEdit(jobKey, "_dimensions", json);
              setData((prev) => prev.map((sh) => sh._id === target._id ? { ...sh, extra: { ...(sh.extra || {}), _dimensions: json } } : sh));
              setDimensionsRowId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

// ─── Dimensions popup (task L) ───────────────────────────────────────
interface DimensionRow {
  colli: string;
  length: string;
  width: string;
  height: string;
  weightPerPiece: string;
  volumePerPiece: string;
  packing: string;
  stackable: string;
}

const PACKING_OPTIONS = ["COLLI", "PALLET", "PIECE", "BOX", "CARTON", "CRATE"];
const STACK_OPTIONS = ["Stackable", "Not Stackable"];

function DimensionsPopup({ initialRows, onClose, onSave }: { initialRows: DimensionRow[]; onClose: () => void; onSave: (rows: DimensionRow[]) => void; }) {
  const [rows, setRows] = useState<DimensionRow[]>(initialRows.length > 0 ? initialRows : [{ colli: "", length: "", width: "", height: "", weightPerPiece: "", volumePerPiece: "", packing: "", stackable: "" }]);

  // Recompute Volume Per Piece = (L×W×H) / 1,000,000 whenever L/W/H change
  const updateRow = (idx: number, field: keyof DimensionRow, value: string) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [field]: value };
      if (field === "length" || field === "width" || field === "height") {
        const L = parseFloat(next.length || "0") || 0;
        const W = parseFloat(next.width || "0") || 0;
        const H = parseFloat(next.height || "0") || 0;
        const vol = (L * W * H) / 1_000_000;
        next.volumePerPiece = vol > 0 ? vol.toFixed(4) : "";
      }
      return next;
    }));
  };
  const addRow = () => setRows((prev) => [...prev, { colli: "", length: "", width: "", height: "", weightPerPiece: "", volumePerPiece: "", packing: "", stackable: "" }]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  // Totals
  const totalColli = rows.reduce((sum, r) => sum + (parseFloat(r.colli || "0") || 0), 0);
  const totalWeight = rows.reduce((sum, r) => sum + (parseFloat(r.colli || "0") || 0) * (parseFloat(r.weightPerPiece || "0") || 0), 0);
  const totalVolume = rows.reduce((sum, r) => sum + (parseFloat(r.colli || "0") || 0) * (parseFloat(r.volumePerPiece || "0") || 0), 0);

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "hsl(var(--surface-10))", border: "1px solid hsl(var(--surface-18))", borderRadius: 8, padding: 20, maxWidth: "95vw", width: 1100, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ color: "var(--brand-teal)", fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>Dimensions</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "hsl(var(--muted-45))", cursor: "pointer", fontSize: 18 }} title="Close">×</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "hsl(var(--surface-13))", borderBottom: "1px solid hsl(var(--surface-20))" }}>
              {["Colli", "Length (cm)", "Width (cm)", "Height (cm)", "Weight Per Piece In KG", "Volume Per Piece In CBM", "Packing", "Stackable/Overstowable", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "hsl(var(--muted-55))", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--surface-15))" }}>
                {(["colli", "length", "width", "height", "weightPerPiece"] as const).map((field) => (
                  <td key={field} style={{ padding: "4px 6px" }}>
                    <input type="number" value={r[field]} onChange={(e) => updateRow(idx, field, e.target.value)} style={{ width: "100%", padding: "6px 8px", background: "hsl(var(--surface-9))", border: "1px solid hsl(var(--surface-18))", borderRadius: 4, color: "hsl(var(--fg-96))", fontSize: 12 }} />
                  </td>
                ))}
                <td style={{ padding: "4px 6px" }}>
                  <input value={r.volumePerPiece} readOnly title="(L×W×H)/1,000,000" style={{ width: "100%", padding: "6px 8px", background: "hsl(var(--surface-8))", border: "1px solid hsl(var(--surface-15))", borderRadius: 4, color: "#9e9e9e", fontSize: 12, fontStyle: "italic" }} />
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select value={r.packing} onChange={(e) => updateRow(idx, "packing", e.target.value)} style={{ width: "100%", padding: "6px 8px", background: "hsl(var(--surface-9))", border: "1px solid hsl(var(--surface-18))", borderRadius: 4, color: "hsl(var(--fg-96))", fontSize: 12 }}>
                    <option value="">—</option>
                    {PACKING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <select value={r.stackable} onChange={(e) => updateRow(idx, "stackable", e.target.value)} style={{ width: "100%", padding: "6px 8px", background: "hsl(var(--surface-9))", border: "1px solid hsl(var(--surface-18))", borderRadius: 4, color: "hsl(var(--fg-96))", fontSize: 12 }}>
                    <option value="">—</option>
                    {STACK_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(idx)} style={{ background: "transparent", border: "none", color: "var(--brand-red-strong)", cursor: "pointer", padding: 4 }} title="Remove row">✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "hsl(var(--surface-13))", fontWeight: 600, color: "var(--brand-teal)" }}>
              <td style={{ padding: "10px", fontSize: 11 }}>{totalColli} total</td>
              <td colSpan={3} />
              <td style={{ padding: "10px", fontSize: 11 }}>Σ {totalWeight.toFixed(2)} kg</td>
              <td style={{ padding: "10px", fontSize: 11 }}>Σ {totalVolume.toFixed(3)} cbm</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
        <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "space-between" }}>
          <button onClick={addRow} style={{ padding: "8px 14px", background: "hsl(var(--surface-13))", border: "1px solid hsl(var(--surface-22))", borderRadius: 4, color: "var(--brand-teal)", cursor: "pointer", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>+ Add row</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "8px 18px", background: "transparent", border: "1px solid hsl(var(--surface-22))", borderRadius: 4, color: "hsl(var(--muted-60))", cursor: "pointer", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Cancel</button>
            <button onClick={() => onSave(rows)} style={{ padding: "8px 18px", background: "var(--brand-teal)", border: "none", borderRadius: 4, color: "var(--on-brand-teal)", cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter button with popover ────────────────────────────────────

function FilterButton({
  col,
  isActive,
  isOpen,
  onToggle,
  allValues,
  filter,
  colType,
  onApply,
  onClear,
  onClose,
}: {
  col: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  allValues: string[];
  filter: ColumnFilter | undefined;
  colType: ColumnType;
  onApply: (f: ColumnFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [portalPos, setPortalPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPortalPos({ top: rect.bottom + 4, left: rect.left });
    } else {
      setPortalPos(null);
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex items-center justify-center w-5 h-5 rounded transition-colors ${
          isActive
            ? "bg-[var(--brand-teal)]/20 text-[var(--brand-teal)]"
            : "text-[hsl(215,20%,40%)] hover:text-[hsl(215,20%,60%)]"
        }`}
        title={`Filter ${col}`}
        data-testid={`filter-btn-${col}`}
      >
        <Filter className="w-3 h-3" />
        {isActive && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--brand-teal)]" />
        )}
      </button>
      {isOpen && portalPos && createPortal(
        <FilterPopover
          col={col}
          allValues={allValues}
          filter={filter}
          colType={colType}
          onApply={onApply}
          onClear={onClear}
          onClose={onClose}
          portalPos={portalPos}
        />,
        document.body
      )}
    </div>
  );
}
