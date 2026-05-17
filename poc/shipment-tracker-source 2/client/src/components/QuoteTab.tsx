import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, X, Filter, Plus, Trash2, AlertTriangle, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useShipments } from "@/lib/shipment-context";
import { useAuth } from "@/lib/auth-context";
import { QuoteCostSection, type BookedData } from "./QuoteCostSection";
import { QuoteDetailModal } from "./QuoteDetailModal";

// ─── Column definitions ──────────────────────────────────────────────

const QUOTE_COLUMNS = [
  "Quote number",
  "Shipper",
  "Consignee",
  "Service",
  "Trade Direction",
  "Load Type",
  "Agent",
  "Agent's PIC",
  "Incoterm Origin",
  "Incoterm Destination",
  "Cargo Origin",
  "Origin",
  "POL",
  "POD",
  "Destination",
  "HS Code",
  "Cargo Description",
  "Volume",
  "Weight",
  "Number of pieces",
  "CNTR count [1]",
  "CNTR length [1]",
  "CNTR count [2]",
  "CNTR length [2]",
  "CNTR count [3]",
  "CNTR length [3]",
  "CNTR count [4]",
  "CNTR length [4]",
  "PCS",
] as const;

type QuoteColumn = (typeof QUOTE_COLUMNS)[number];

const COPYABLE_FIELDS: QuoteColumn[] = [
  "Shipper",
  "Consignee",
  "Agent",
  "Agent's PIC",
  "Incoterm Origin",
  "Incoterm Destination",
  "Cargo Origin",
  "Origin",
  "POL",
  "POD",
  "Destination",
  "HS Code",
  "Cargo Description",
];

// Dropdown options for Quote columns. Incoterm and Load Type / Trade Direction
// match the Shipments tab so values stay consistent across the system.
const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DPU", "DAP", "DDP"];
const DROPDOWN_COLUMNS: Record<string, string[]> = {
  "Load Type": ["Full Load", "Consolidation", "Customs Clearance"],
  "Service": ["SEA", "AIR", "RAIL", "ROAD"],
  "Trade Direction": ["Import", "Export"],
  "Incoterm Origin": INCOTERMS,
  "Incoterm Destination": INCOTERMS,
  "CNTR length [1]": ["20", "40", "40HC", "45"],
  "CNTR length [2]": ["20", "40", "40HC", "45"],
  "CNTR length [3]": ["20", "40", "40HC", "45"],
  "CNTR length [4]": ["20", "40", "40HC", "45"],
};

const NUMBER_COLUMNS = new Set<string>([
  "Volume",
  "Weight",
  "Number of pieces",
  "CNTR count [1]",
  "CNTR count [2]",
  "CNTR count [3]",
  "CNTR count [4]",
  "PCS",
]);

function getColumnWidth(col: string): number {
  if (col === "Cargo Description") return 200;
  return 130;
}

function getColumnType(col: string): "readonly" | "dropdown" | "number" | "text" {
  if (col === "Quote number") return "readonly";
  if (DROPDOWN_COLUMNS[col]) return "dropdown";
  if (NUMBER_COLUMNS.has(col)) return "number";
  return "text";
}

// ─── Types ──────────────────────────────────────────────────────────

interface Quote {
  id: number;
  quoteNumber: string;
  data: string;
  createdAt: string;
}

interface ParsedQuote {
  id: number;
  quoteNumber: string;
  data: Record<string, string>;
  createdAt: string;
}

interface EditingCell {
  quoteNumber: string;
  col: string;
}

interface ColumnFilter {
  type: "text" | "values";
  textValue?: string;
  selectedValues?: Set<string>;
}

function parseQuote(q: Quote): ParsedQuote {
  let parsed: Record<string, string> = {};
  try {
    parsed = typeof q.data === "string" ? JSON.parse(q.data) : (q.data as Record<string, string>) || {};
  } catch {
    parsed = {};
  }
  return { id: q.id, quoteNumber: q.quoteNumber, data: parsed, createdAt: q.createdAt };
}

function getQuoteValue(q: ParsedQuote, col: string): string {
  if (col === "Quote number") return q.quoteNumber;
  return q.data[col] || "";
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
      onChange={(e) => onChange(e.target.value)}
      onBlur={onClose}
      className="w-full bg-[hsl(222,47%,12%)] text-[hsl(210,40%,96%)] border border-[hsl(217,33%,25%)] rounded text-[11px] px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
      style={{ minWidth: "60px" }}
      data-testid="cell-dropdown"
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function TextEditor({
  value,
  inputType,
  onChange,
  onClose,
}: {
  value: string;
  inputType: "text" | "number";
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
      type={inputType}
      value={localVal}
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
  colType: ReturnType<typeof getColumnType>;
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
  colType: ReturnType<typeof getColumnType>;
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

// ─── Main component ─────────────────────────────────────────────────

export function QuoteTab() {
  const { data: shipmentData, refreshFromAPI } = useShipments();
  const { user: authUser } = useAuth();
  // ─── State ──────────────────────────────────────────────────────
  const [quotes, setQuotes] = useState<ParsedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);

  // Delete state
  // Selected quote for cost section
  const [selectedQuoteNumber, setSelectedQuoteNumber] = useState("");
  // Quote detail modal
  const [detailModalQuote, setDetailModalQuote] = useState<ParsedQuote | null>(null);

  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteQuoteInput, setDeleteQuoteInput] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetLabel, setDeleteTargetLabel] = useState("");

  // New Quote dialog state
  type NewQuoteStep = "ask-copy" | "select-fields";
  const [newQuoteDialogOpen, setNewQuoteDialogOpen] = useState(false);
  const [newQuoteStep, setNewQuoteStep] = useState<NewQuoteStep>("ask-copy");
  const [newQuoteNumber, setNewQuoteNumber] = useState("");
  const [copyFromQuote, setCopyFromQuote] = useState("");
  const [copyFromDropdownOpen, setCopyFromDropdownOpen] = useState(false);
  const [copyFromSearch, setCopyFromSearch] = useState("");
  const [selectedCopyFields, setSelectedCopyFields] = useState<Set<string>>(new Set(COPYABLE_FIELDS));
  const copyFromDropdownRef = useRef<HTMLDivElement>(null);

  // Debounce refs for auto-save
  const saveTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Refs for synchronized scrolling
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const rightBodyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // ─── Load quotes on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/quotes");
        const raw: Quote[] = await res.json();
        if (!cancelled) {
          setQuotes(raw.map(parseQuote));
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load quotes:", err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Sync vertical scroll between left and right panes ─────────
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

  // ─── Column splits (frozen: Quote number only) ─────────────────
  const frozenCols: QuoteColumn[] = ["Quote number"];
  const scrollCols = useMemo(() => QUOTE_COLUMNS.filter((c) => c !== "Quote number"), []);

  // ─── Filter logic ─────────────────────────────────────────────
  const getColumnValues = useCallback(
    (col: string): string[] => quotes.map((q) => getQuoteValue(q, col)),
    [quotes]
  );

  const filteredQuotes = useMemo(() => {
    let result = quotes;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((quote) => {
        for (const col of QUOTE_COLUMNS) {
          const val = getQuoteValue(quote, col);
          if (val && val.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    for (const [col, filter] of Object.entries(columnFilters)) {
      if (filter.type === "text" && filter.textValue) {
        const q = filter.textValue.toLowerCase();
        result = result.filter((quote) => {
          const val = getQuoteValue(quote, col);
          return val.toLowerCase().includes(q);
        });
      } else if (filter.type === "values" && filter.selectedValues) {
        const allowed = filter.selectedValues;
        result = result.filter((quote) => {
          const val = getQuoteValue(quote, col);
          if (!val) return allowed.size === 0 || allowed.has("");
          return allowed.has(val);
        });
      }
    }
    return result;
  }, [quotes, search, columnFilters]);

  const activeFilterCount = Object.keys(columnFilters).length;

  // ─── Editing ──────────────────────────────────────────────────
  const startEditing = useCallback((quoteNumber: string, col: string) => {
    if (col === "Quote number") return;
    setEditingCell({ quoteNumber, col });
  }, []);

  const commitEdit = useCallback(
    (quoteNumber: string, col: string, value: string) => {
      setQuotes((prev) =>
        prev.map((q) => {
          if (q.quoteNumber !== quoteNumber) return q;
          const newData = { ...q.data, [col]: value };
          // Debounced auto-save
          const existingTimer = saveTimerRef.current.get(quoteNumber);
          if (existingTimer) clearTimeout(existingTimer);
          const timer = setTimeout(() => {
            apiRequest("PATCH", `/api/quotes/${encodeURIComponent(quoteNumber)}`, { data: newData }).catch(
              (err) => console.error("Failed to save quote:", err)
            );
            saveTimerRef.current.delete(quoteNumber);
          }, 400);
          saveTimerRef.current.set(quoteNumber, timer);
          return { ...q, data: newData };
        })
      );
      setEditingCell(null);
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // ─── Auto-number generation ───────────────────────────────────
  const generateNextQuoteNumber = useCallback(async () => {
    let maxNum = 0;
    // Scan visible quotes
    for (const q of quotes) {
      const qn = q.quoteNumber;
      if (qn && qn.startsWith("CZQ")) {
        const numPart = parseInt(qn.substring(3), 10);
        if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
      }
    }
    // Also scan ALL quotes (including soft-deleted) to avoid number collisions
    try {
      const resp = await apiRequest("GET", "/api/quotes?include_deleted=1");
      const allQuotes: any[] = await resp.json();
      for (const q of allQuotes) {
        const qn = q.quoteNumber || "";
        if (qn.startsWith("CZQ")) {
          const num = parseInt(qn.substring(3), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    } catch { /* continue with visible count */ }
    const next = maxNum + 1;
    return `CZQ${String(next).padStart(8, "0")}`;
  }, [quotes]);

  // ─── New Quote dialog ─────────────────────────────────────────
  const openNewQuoteDialog = useCallback(async () => {
    const nextQN = await generateNextQuoteNumber();
    setNewQuoteNumber(nextQN);
    setCopyFromQuote("");
    setCopyFromSearch("");
    setSelectedCopyFields(new Set(COPYABLE_FIELDS));
    setNewQuoteStep("ask-copy");
    setNewQuoteDialogOpen(true);
  }, [generateNextQuoteNumber]);

  const createNewQuoteBlank = useCallback(async () => {
    try {
      const res = await apiRequest("POST", "/api/quotes", {
        quoteNumber: newQuoteNumber,
        data: {},
      });
      const created: Quote = await res.json();
      setQuotes((prev) => [parseQuote(created), ...prev]);
    } catch (err) {
      console.error("Failed to create quote:", err);
    }
    setNewQuoteDialogOpen(false);
  }, [newQuoteNumber]);

  const createNewQuoteWithCopy = useCallback(async () => {
    const sourceQuote = quotes.find((q) => q.quoteNumber === copyFromQuote);
    if (!sourceQuote) return;

    const copiedData: Record<string, string> = {};
    for (const field of Array.from(selectedCopyFields)) {
      const val = sourceQuote.data[field];
      if (val) copiedData[field] = val;
    }

    try {
      const res = await apiRequest("POST", "/api/quotes", {
        quoteNumber: newQuoteNumber,
        data: copiedData,
      });
      const created: Quote = await res.json();
      setQuotes((prev) => [parseQuote(created), ...prev]);
    } catch (err) {
      console.error("Failed to create quote with copy:", err);
    }
    setNewQuoteDialogOpen(false);
  }, [quotes, copyFromQuote, newQuoteNumber, selectedCopyFields]);

  // ─── Delete Quote ─────────────────────────────────────────────
  const handleDeleteRequest = useCallback(() => {
    const qn = deleteQuoteInput.trim();
    if (!qn) return;
    const found = quotes.find((q) => q.quoteNumber === qn);
    if (!found) {
      alert(`No quote found with Quote Number "${qn}"`);
      return;
    }
    setDeleteTargetLabel(`${found.quoteNumber} — ${found.data["Shipper"] || found.data["Consignee"] || "(no name)"}`);
    setDeleteConfirmOpen(true);
  }, [deleteQuoteInput, quotes]);

  const confirmDelete = useCallback(async () => {
    const qn = deleteQuoteInput.trim();
    try {
      await apiRequest("DELETE", `/api/quotes/${encodeURIComponent(qn)}`);
      setQuotes((prev) => prev.filter((q) => q.quoteNumber !== qn));
    } catch (err) {
      console.error("Failed to delete quote:", err);
    }
    setDeleteConfirmOpen(false);
    setDeleteQuoteInput("");
    setDeleteMode(false);
  }, [deleteQuoteInput]);

  // ─── Booked handler ─────────────────────────────────────────────
  const handleBooked = useCallback(async (data: BookedData) => {
    try {
      // 1. Generate next job number — scan both live data AND all edit history to avoid collisions
      let maxNum = 0;
      for (const s of shipmentData) {
        const jn = s.jobNumber;
        if (jn && jn.startsWith("CZ") && !jn.startsWith("CZQ")) {
          const num = parseInt(jn.substring(2), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
      // Also scan edit history for deleted/previously-created job numbers
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
      } catch { /* continue with what we have */ }
      const newJobNumber = `CZ${String(maxNum + 1).padStart(8, "0")}`;

      // 2. Build shipment from quote data
      const shipmentPayload: Record<string, any> = {
        row: Date.now(),
        jobNumber: newJobNumber,
        month: "", dept: "OPS", handler: authUser?.email || "",
        shipper: data.quoteData["Shipper"] || "",
        consignee: data.quoteData["Consignee"] || "",
        customsStatus: "\u010cek\u00e1me na doklady",
        status: "CHYB\u00cd PLUT\u00cd [IMP]",
        shipmentType: data.quoteData["Trade Direction"] || "IMP",
        fclLcl: data.quoteData["Load Type"] || "",
        shippingLine: "",
        pol: data.quoteData["POL"] || "",
        pod: data.quoteData["POD"] || "",
        etd: "", eta: "", etaDepo: "", etaCnee: "", vessel: "",
        goods: data.quoteData["Cargo Description"] || "",
        hsCode: data.quoteData["HS Code"] || "",
        destination: data.quoteData["Destination"] || "",
        extra: {
          "Agent": data.quoteData["Agent"] || "",
          "Agent's PIC": data.quoteData["Agent's PIC"] || "",
          "Incoterm Origin": data.quoteData["Incoterm Origin"] || "",
          "Incoterm Destination": data.quoteData["Incoterm Destination"] || "",
          "Cargo Origin": data.quoteData["Cargo Origin"] || "",
          "Origin": data.quoteData["Origin"] || "",
          "Sales Number": data.selectedInvoiceNumber,
          "Linked Quote": data.quoteNumber,
          "Created by": (() => {
            const now = new Date();
            const cetStr = now.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
            return `${cetStr} \u2014 ${authUser?.email || "System"}`;
          })(),
        },
        _id: `booked-${Date.now()}`,
      };

      // 3. Create shipment
      await apiRequest("POST", "/api/shipment-edits", {
        action: "create",
        jobKey: shipmentPayload._id,
        payload: shipmentPayload,
      });

      // 4. Copy Suppliers Costs -> Estimated Costs in Invoicing
      for (const cost of data.costs) {
        if (cost.realAmount) {
          await apiRequest("POST", "/api/invoicing/costs", {
            jobNumber: newJobNumber, category: cost.category,
            estAmount: cost.realAmount, estCurrency: cost.realCurrency,
            realAmount: "", realCurrency: "CZK", invoiceNumber: "", vendor: "",
          });
        }
      }
      for (const ac of data.additionalCharges) {
        if (ac.realAmount || ac.description) {
          await apiRequest("POST", "/api/invoicing/additional", {
            jobNumber: newJobNumber, description: ac.description || "",
            estAmount: ac.realAmount || "", estCurrency: ac.realCurrency || "CZK",
            realAmount: "", realCurrency: "CZK", invoiceNumber: "", vendor: "", sortOrder: 0,
          });
        }
      }

      // 5. Copy Billing settings + overrides
      await apiRequest("POST", "/api/billing/settings", {
        jobNumber: newJobNumber, billingCurrency: data.billingCurrency, roe: data.roe,
      });
      for (const [rowKey, amount] of Object.entries(data.billingOverrides)) {
        if (amount) {
          await apiRequest("POST", "/api/billing/override", {
            jobNumber: newJobNumber, rowKey, billingAmount: amount,
          });
        }
      }

      // 6. Refresh Full Sheet data so the new shipment appears
      await refreshFromAPI();

      alert(`Shipment ${newJobNumber} created from quote ${data.selectedInvoiceNumber}. Switch to Full Sheet to see it.`);
    } catch (err) {
      console.error("Failed to create shipment from quote:", err);
      alert("Failed to create shipment. Please try again.");
    }
  }, [shipmentData, refreshFromAPI]);

  // ─── Filter helpers ───────────────────────────────────────────
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

  // ─── Header / filter cell renderers ───────────────────────────
  const renderHeaderCell = useCallback(
    (col: string, isLastFrozen: boolean) => (
      <th
        key={col}
        className={`relative text-left px-2 py-2 font-semibold whitespace-nowrap border-b border-border/50 text-[11px] select-none ${
          isLastFrozen ? "border-r-2 border-r-[hsl(from_var(--brand-teal)_h_s_l/0.4)]" : ""
        }`}
        style={{
          width: `${getColumnWidth(col)}px`,
          minWidth: `${getColumnWidth(col)}px`,
          background: "hsl(var(--surface-10))",
          color: "hsl(var(--muted-50))",
        }}
        data-testid={`col-header-${col}`}
      >
        {col}
      </th>
    ),
    []
  );

  const renderFilterCell = useCallback(
    (col: string, isLastFrozen: boolean) => (
      <th
        key={`filter-${col}`}
        className={`px-1 py-1 border-b border-border/50 ${
          isLastFrozen ? "border-r-2 border-r-[hsl(from_var(--brand-teal)_h_s_l/0.4)]" : ""
        }`}
        style={{
          width: `${getColumnWidth(col)}px`,
          minWidth: `${getColumnWidth(col)}px`,
          background: "hsl(var(--surface-9))",
        }}
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
    ),
    [columnFilters, openFilterCol, getColumnValues, applyColumnFilter, clearColumnFilter]
  );

  // ─── Cell renderer ────────────────────────────────────────────
  const renderCell = useCallback(
    (q: ParsedQuote, col: string, isLastFrozen: boolean) => {
      const val = getQuoteValue(q, col);
      const colType = getColumnType(col);
      const isEditing = editingCell?.quoteNumber === q.quoteNumber && editingCell?.col === col;
      const isQuoteNumber = col === "Quote number";

      return (
        <td
          key={col}
          className={`px-2 whitespace-nowrap text-[11px] cursor-pointer ${
            isLastFrozen ? "border-r-2 border-r-[hsl(from_var(--brand-teal)_h_s_l/0.4)]" : ""
          } ${isQuoteNumber ? "font-mono tabular-nums" : ""}`}
          style={{
            height: "28px",
            maxHeight: "28px",
            lineHeight: "28px",
            padding: "0 8px",
            overflow: "hidden",
            boxSizing: "border-box",
            width: `${getColumnWidth(col)}px`,
            minWidth: `${getColumnWidth(col)}px`,
            maxWidth: `${getColumnWidth(col)}px`,
            color: isQuoteNumber ? "var(--brand-teal)" : undefined,
          }}
          onClick={() => {
            if (isQuoteNumber) {
              setDetailModalQuote(q);
            } else {
              startEditing(q.quoteNumber, col);
            }
          }}
          data-testid={`quote-cell-${col}-${q.quoteNumber}`}
        >
          {isEditing ? (
            colType === "dropdown" ? (
              <DropdownEditor
                value={val}
                options={DROPDOWN_COLUMNS[col] || []}
                onChange={(v) => commitEdit(q.quoteNumber, col, v)}
                onClose={cancelEdit}
              />
            ) : (
              <TextEditor
                value={val}
                inputType={colType === "number" ? "number" : "text"}
                onChange={(v) => commitEdit(q.quoteNumber, col, v)}
                onClose={cancelEdit}
              />
            )
          ) : (
            <span className={val ? "" : "text-muted-foreground/30"}>
              {val || "—"}
            </span>
          )}
        </td>
      );
    },
    [editingCell, startEditing, commitEdit, cancelEdit]
  );

  // ─── Frozen column widths ─────────────────────────────────────
  const frozenWidth = frozenCols.reduce((sum, c) => sum + getColumnWidth(c), 0);
  const scrollWidth = scrollCols.reduce((sum, c) => sum + getColumnWidth(c), 0);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="quote-tab">
        <span className="text-xs text-muted-foreground">Loading quotes...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="quote-tab">
      {/* Toolbar */}
      <div
        className="flex-none flex items-center gap-3 px-4 py-2 border-b border-border/50"
        style={{ background: "hsl(var(--surface-8))" }}
      >
        <button
          onClick={openNewQuoteDialog}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--brand-teal)] text-white hover:bg-[var(--brand-teal-strong)] transition-colors"
          data-testid="btn-new-quote"
        >
          <Plus className="w-3.5 h-3.5" />
          New Quote
        </button>

        {/* Delete Quote toggle + input */}
        {!deleteMode ? (
          <button
            onClick={() => setDeleteMode(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-red-600/80 text-white hover:bg-red-600 transition-colors"
            data-testid="btn-delete-quote"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Quote
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Enter Quote Number..."
              value={deleteQuoteInput}
              onChange={(e) => setDeleteQuoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDeleteRequest();
                if (e.key === "Escape") {
                  setDeleteMode(false);
                  setDeleteQuoteInput("");
                }
              }}
              className="w-40 px-2 py-1.5 text-xs rounded-md border border-red-500/50 bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
              autoFocus
              data-testid="delete-quote-input"
            />
            <button
              onClick={handleDeleteRequest}
              disabled={!deleteQuoteInput.trim()}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              data-testid="btn-confirm-delete-quote"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
            <button
              onClick={() => {
                setDeleteMode(false);
                setDeleteQuoteInput("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1.5 transition-colors"
              data-testid="btn-cancel-delete"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search quotes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-md border border-border/50 bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="search-quotes"
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
          {filteredQuotes.length} / {quotes.length} rows
        </span>
      </div>

      {/* Main content: scrollable container for table + cost section */}
      <div className="flex-1 flex flex-col overflow-auto" style={{ background: "hsl(var(--surface-6))" }}>

      {/* Split-pane table area */}
      <div className={`flex overflow-hidden ${selectedQuoteNumber ? "" : "flex-1"}`} style={{ minHeight: selectedQuoteNumber ? "320px" : undefined }}>
        {/* ── LEFT FROZEN PANE ── */}
        <div className="flex-none flex flex-col border-r-2 border-r-[hsl(from_var(--brand-teal)_h_s_l/0.3)]">
          {/* Frozen header */}
          <div className="flex-none overflow-hidden">
            <table
              className="text-xs border-collapse"
              style={{ tableLayout: "fixed", width: `${frozenWidth}px` }}
            >
              <thead>
                <tr>{frozenCols.map((col) => renderHeaderCell(col, true))}</tr>
                <tr>{frozenCols.map((col) => renderFilterCell(col, true))}</tr>
              </thead>
            </table>
          </div>

          {/* Frozen body */}
          <div
            ref={leftBodyRef}
            className="flex-1 overflow-x-auto overflow-y-scroll hide-scrollbar"
            style={{ overscrollBehavior: "contain" }}
            onScroll={() => syncScroll("left")}
          >
            <table
              className="text-xs border-collapse"
              style={{ tableLayout: "fixed", width: `${frozenWidth}px` }}
            >
              <tbody>
                {filteredQuotes.map((q) => (
                  <tr
                    key={q.quoteNumber}
                    className={`border-b border-border/20 hover:bg-white/[0.02] transition-colors ${q.quoteNumber === selectedQuoteNumber ? "bg-[var(--brand-teal)]/10" : ""}`}
                    style={{ height: "28px" }}
                    data-testid={`quote-row-${q.quoteNumber}`}
                  >
                    {frozenCols.map((col) => renderCell(q, col, true))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT SCROLLABLE PANE ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Scroll header */}
          <div className="flex-none overflow-hidden" id="quote-right-header-scroll">
            <div
              className="overflow-x-auto"
              style={{ overflowY: "hidden" }}
              onScroll={(e) => {
                const bodyEl = rightBodyRef.current;
                if (bodyEl) {
                  bodyEl.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
                }
              }}
            >
              <table
                className="text-xs border-collapse"
                style={{ tableLayout: "fixed", width: `${scrollWidth}px` }}
              >
                <thead>
                  <tr>{scrollCols.map((col) => renderHeaderCell(col, false))}</tr>
                  <tr>{scrollCols.map((col) => renderFilterCell(col, false))}</tr>
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
              const headerEl = document.getElementById("quote-right-header-scroll")?.firstElementChild as HTMLElement;
              if (headerEl) {
                headerEl.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
              }
            }}
          >
            <table
              className="text-xs border-collapse"
              style={{ tableLayout: "fixed", width: `${scrollWidth}px` }}
            >
              <tbody>
                {filteredQuotes.map((q) => (
                  <tr
                    key={q.quoteNumber}
                    className={`border-b border-border/20 hover:bg-white/[0.02] transition-colors ${q.quoteNumber === selectedQuoteNumber ? "bg-[var(--brand-teal)]/10" : ""}`}
                    style={{ height: "28px" }}
                  >
                    {scrollCols.map((col) => renderCell(q, col, false))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Suppliers Costs + Billing section (shown when a quote is selected) */}
      {selectedQuoteNumber && (() => {
        const selectedQ = quotes.find((q) => q.quoteNumber === selectedQuoteNumber);
        return selectedQ ? (
          <div className="border-t-2 border-[var(--brand-teal)]/30">
            <QuoteCostSection quoteNumber={selectedQuoteNumber} quoteData={selectedQ.data} onBooked={handleBooked} />
          </div>
        ) : null;
      })()}

      </div>{/* end of main scrollable container */}

      {/* ── New Quote dialog ── */}
      {newQuoteDialogOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setNewQuoteDialogOpen(false)}
            data-testid="new-quote-dialog"
          >
            <div
              className="rounded-lg p-6 shadow-2xl max-w-md w-full mx-4"
              style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--surface-20))" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Step 1: Ask copy */}
              {newQuoteStep === "ask-copy" && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--brand-teal)]/20">
                      <Plus className="w-5 h-5 text-[var(--brand-teal)]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">New Quote</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Quote Number:{" "}
                        <span className="font-mono font-medium text-[var(--brand-teal)]">{newQuoteNumber}</span>
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-foreground/80 mb-4">
                    Would you like to copy data from a previous quote?
                  </p>

                  {/* Copy from quote selector */}
                  <div className="mb-4" ref={copyFromDropdownRef}>
                    <label className="block text-[11px] text-muted-foreground mb-1">
                      Copy from Quote Number
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={copyFromDropdownOpen ? copyFromSearch : copyFromQuote}
                        placeholder="Search or select..."
                        onChange={(e) => {
                          setCopyFromSearch(e.target.value);
                          if (!copyFromDropdownOpen) setCopyFromDropdownOpen(true);
                        }}
                        onFocus={() => setCopyFromDropdownOpen(true)}
                        className="w-full px-3 py-2 text-xs rounded-md border border-border/50 bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
                        data-testid="copy-from-input"
                      />
                      {copyFromDropdownOpen && (
                        <div
                          className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border/50 shadow-xl overflow-y-auto max-h-40"
                          style={{ background: "hsl(var(--surface-11))" }}
                        >
                          {quotes
                            .map((q) => q.quoteNumber)
                            .filter(
                              (qn) =>
                                qn &&
                                (!copyFromSearch ||
                                  qn.toLowerCase().includes(copyFromSearch.toLowerCase()))
                            )
                            .map((qn) => (
                              <button
                                key={qn}
                                onClick={() => {
                                  setCopyFromQuote(qn);
                                  setCopyFromDropdownOpen(false);
                                  setCopyFromSearch("");
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2 ${
                                  qn === copyFromQuote ? "text-[var(--brand-teal)]" : "text-foreground"
                                }`}
                                data-testid={`copy-quote-opt-${qn}`}
                              >
                                {qn === copyFromQuote && <Check className="w-3 h-3" />}
                                <span className={qn === copyFromQuote ? "" : "ml-5"}>{qn}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setNewQuoteDialogOpen(false)}
                      className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      data-testid="btn-cancel-new"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createNewQuoteBlank}
                      className="text-xs px-4 py-2 rounded-md border border-border/50 text-foreground hover:bg-white/5 transition-colors"
                      data-testid="btn-create-blank"
                    >
                      Create Blank
                    </button>
                    {copyFromQuote && (
                      <button
                        onClick={() => setNewQuoteStep("select-fields")}
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
              {newQuoteStep === "select-fields" && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--brand-teal)]/20">
                      <Copy className="w-5 h-5 text-[var(--brand-teal)]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Select Fields to Copy</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        From <span className="font-mono text-[var(--brand-teal)]">{copyFromQuote}</span> →{" "}
                        <span className="font-mono text-[var(--brand-teal)]">{newQuoteNumber}</span>
                      </p>
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
                      const sourceQuote = quotes.find((q) => q.quoteNumber === copyFromQuote);
                      const val = sourceQuote ? sourceQuote.data[field] || "" : "";
                      const checked = selectedCopyFields.has(field);
                      return (
                        <div
                          key={field}
                          className="flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/[0.03] transition-colors"
                          onClick={() => {
                            setSelectedCopyFields((prev) => {
                              const next = new Set(prev);
                              if (next.has(field)) next.delete(field);
                              else next.add(field);
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
                          <span className="text-xs font-mono text-muted-foreground truncate">
                            {val || (
                              <span className="italic text-muted-foreground/30">empty</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setNewQuoteStep("ask-copy")}
                      className="text-xs px-4 py-2 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      data-testid="btn-back-copy"
                    >
                      Back
                    </button>
                    <button
                      onClick={createNewQuoteWithCopy}
                      disabled={selectedCopyFields.size === 0}
                      className="text-xs px-4 py-2 rounded-md bg-[var(--brand-teal)] text-white font-medium hover:bg-[var(--brand-teal-strong)] transition-colors disabled:opacity-40"
                      data-testid="btn-create-with-copy"
                    >
                      Create Quote
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* ── Quote Detail Modal ── */}
      {detailModalQuote && (
        <QuoteDetailModal
          quoteNumber={detailModalQuote.quoteNumber}
          quoteData={detailModalQuote.data}
          onClose={() => setDetailModalQuote(null)}
          onBooked={handleBooked}
        />
      )}

      {/* ── Delete confirmation dialog ── */}
      {deleteConfirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setDeleteConfirmOpen(false)}
            data-testid="delete-quote-dialog"
          >
            <div
              className="rounded-lg p-6 shadow-2xl max-w-sm w-full mx-4"
              style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--surface-20))" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-600/20">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Delete Quote</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">The quote will be hidden but kept in the database</p>
                </div>
              </div>
              <p className="text-xs text-foreground/80 mb-5">
                Are you sure you want to delete quote{" "}
                <strong className="text-foreground">{deleteTargetLabel}</strong>?
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
    </div>
  );
}
