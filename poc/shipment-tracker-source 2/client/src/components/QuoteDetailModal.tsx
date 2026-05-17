import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  Upload,
  FileText,
  File,
  Trash2,
  MapPin,
  Ship,
  Package,
  Anchor,
  Maximize2,
  Minimize2,
  ExternalLink,
  Copy,
  Plane,
  TrainFront,
  Truck,
  ScrollText,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { QuoteCostSection, type BookedData } from "./QuoteCostSection";

// ─── Types ──────────────────────────────────────────────────────

type TabKey = "details" | "costs" | "documents" | "terms";

interface QuoteDetailModalProps {
  quoteNumber: string;
  quoteData: Record<string, string>;
  onClose: () => void;
  onBooked?: (data: BookedData) => void;
}

// ─── Attachment types ──────────────────────────────────────────

interface AttachmentFile {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt?: string;
}

// ─── Service icon helper ────────────────────────────────────────

function ServiceIcon({ service, className }: { service: string; className?: string }) {
  const s = (service || "").toUpperCase();
  if (s === "AIR") return <Plane className={className} />;
  if (s === "RAIL") return <TrainFront className={className} />;
  if (s === "ROAD") return <Truck className={className} />;
  return <Ship className={className} />;
}

function getServiceLabel(service: string, shipmentType: string): string {
  const s = (service || "SEA").toUpperCase();
  const t = (shipmentType || "").toUpperCase();
  return `${s}${t ? ` ${t}` : ""}`;
}

// ─── Documents Tab ──────────────────────────────────────────────

function DocumentsTab({ quoteNumber }: { quoteNumber: string }) {
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiRequest("GET", `/api/attachments/${encodeURIComponent(quoteNumber)}`);
        const data = await resp.json();
        if (!cancelled) setAttachments(data || []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [quoteNumber]);

  const uploadFile = async (file: globalThis.File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const resp = await apiRequest("POST", `/api/attachments/${encodeURIComponent(quoteNumber)}`, {
          name: file.name,
          size: file.size,
          type: file.type,
          data: base64,
        });
        const newAtt = await resp.json();
        setAttachments((prev) => [...prev, newAtt]);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(uploadFile);
    e.target.value = "";
  };

  const deleteAttachment = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/attachments/${encodeURIComponent(quoteNumber)}/${id}`);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string, name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (type === "application/pdf" || ext === "pdf")
      return <FileText className="w-4 h-4 text-red-400" />;
    if (ext === "doc" || ext === "docx")
      return <FileText className="w-4 h-4 text-blue-400" />;
    if (ext === "xls" || ext === "xlsx")
      return <FileText className="w-4 h-4 text-green-400" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Upload area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragOver ? "border-[var(--brand-teal)] bg-[var(--brand-teal)]/5" : "border-[hsl(217,33%,25%)] hover:border-[hsl(217,33%,35%)]"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="qd-upload-zone"
      >
        <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Drop files here or <span className="text-[var(--brand-teal)]">browse</span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          data-testid="qd-file-input"
        />
      </div>

      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/[0.03] transition-colors"
              style={{ background: "hsl(var(--surface-11))" }}
            >
              {getFileIcon(att.type, att.name)}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{att.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatSize(att.size)}</p>
              </div>
              <button
                onClick={() => deleteAttachment(att.id)}
                className="text-red-400/40 hover:text-red-400 transition-colors p-1"
                data-testid={`qd-delete-att-${att.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && (
        <div className="text-center py-8">
          <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground/50">No documents uploaded yet</p>
        </div>
      )}
    </div>
  );
}

// ─── Terms & Conditions Tab ─────────────────────────────────────

function TermsTab({ quoteNumber }: { quoteNumber: string }) {
  const [terms, setTerms] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiRequest("GET", `/api/quotes/terms/${encodeURIComponent(quoteNumber)}`);
        const data = await resp.json();
        if (!cancelled) {
          setTerms(data.terms || "");
        }
      } catch {
        // If the endpoint doesn't exist yet, just start empty
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [quoteNumber]);

  const handleChange = (value: string) => {
    setTerms(value);
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await apiRequest("POST", `/api/quotes/terms/${encodeURIComponent(quoteNumber)}`, { terms: value });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error("Failed to save terms:", err);
      }
    }, 800);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
          <ScrollText className="w-3.5 h-3.5 text-[var(--brand-teal)]" /> Terms & Conditions
        </h4>
        {saved && (
          <span className="text-[10px] text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
      <textarea
        value={terms}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter terms and conditions for this quote..."
        className="w-full min-h-[300px] text-xs text-foreground bg-transparent rounded-lg p-4 resize-y outline-none focus:ring-1 focus:ring-[var(--brand-teal)]/50"
        style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--border-18))" }}
        data-testid="qd-terms-textarea"
      />
      <p className="text-[10px] text-muted-foreground/50">
        Auto-saves as you type.
      </p>
    </div>
  );
}

// ─── Popout View (full page) ────────────────────────────────────

function PopoutQuoteView({ quoteNumber, quoteData, onClose }: { quoteNumber: string; quoteData: Record<string, string>; onClose: () => void }) {
  const fields = Object.entries(quoteData).filter(([, v]) => v && v.trim() !== "");

  return createPortal(
    <div className="fixed inset-0 z-[999999] overflow-y-auto" style={{ background: "hsl(var(--surface-6))" }}>
      <div className="max-w-5xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-mono text-[var(--brand-teal)]">{quoteNumber}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {quoteData["POL"] || "—"} → {quoteData["POD"] || "—"} → {quoteData["Destination"] || "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors hover:bg-white/5"
            style={{ color: "hsl(var(--muted-65))", border: "1px solid hsl(var(--border-20))" }}
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-2">
          {fields.map(([key, value]) => (
            <div key={key} className="flex flex-col py-1.5 border-b" style={{ borderColor: "hsl(var(--border-15))" }}>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{key}</span>
              <span className="text-xs text-foreground mt-0.5">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main QuoteDetailModal ─────────────────────────────────────

export function QuoteDetailModal({ quoteNumber, quoteData, onClose, onBooked }: QuoteDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [isMaximized, setIsMaximized] = useState(false);
  const [showPopout, setShowPopout] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const service = quoteData["Service"] || "";
  const shipmentType = quoteData["Trade Direction"] || "";
  const pol = quoteData["POL"] || "—";
  const pod = quoteData["POD"] || "—";
  const destination = quoteData["Destination"] || "—";

  // Copy quote number
  const handleCopy = () => {
    navigator.clipboard.writeText(quoteNumber).catch(() => {});
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  const overviewRows = [
    { label: "Shipper", value: quoteData["Shipper"] },
    { label: "Consignee", value: quoteData["Consignee"] },
    { label: "Agent", value: quoteData["Agent"] },
    { label: "PIC Email", value: quoteData["Agent's PIC"] },
    {
      label: "Incoterm",
      value: [quoteData["Incoterm Origin"], quoteData["Incoterm Destination"]]
        .filter(Boolean)
        .join(" / "),
    },
    { label: "Load Type", value: quoteData["Load Type"] },
    { label: "Cargo Origin", value: quoteData["Cargo Origin"] },
  ];

  const cargoRows = [
    { label: "HS Code", value: quoteData["HS Code"] },
    { label: "Goods", value: quoteData["Cargo Description"] },
    { label: "Volume", value: quoteData["Volume"] },
    { label: "Weight", value: quoteData["Weight"] },
    { label: "Pieces", value: quoteData["Number of pieces"] || quoteData["PCS"] },
  ];

  // Container rows
  const cntrRows: { label: string; value: string }[] = [];
  for (let i = 1; i <= 4; i++) {
    const count = quoteData[`CNTR count [${i}]`];
    const length = quoteData[`CNTR length [${i}]`];
    if (count || length) {
      cntrRows.push({ label: `Container ${i}`, value: `${count || "—"} × ${length || "—"}'` });
    }
  }

  if (showPopout) {
    return <PopoutQuoteView quoteNumber={quoteNumber} quoteData={quoteData} onClose={() => setShowPopout(false)} />;
  }

  const iconBtnClass = "w-7 h-7 rounded-md flex items-center justify-center transition-colors";
  const iconBtnStyle = (active?: boolean) => ({
    background: active ? "var(--brand-teal-soft)" : "transparent",
    color: active ? "var(--brand-teal)" : "hsl(var(--muted-55))",
  });

  const TABS: { key: TabKey; label: string }[] = [
    { key: "details", label: "Shipment Details" },
    { key: "costs", label: "Costs Breakdown" },
    { key: "documents", label: "Documents" },
    { key: "terms", label: "Terms & Conditions" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="quote-detail-modal"
    >
      <div
        className={`relative flex flex-col ${
          isMaximized ? "w-[95vw] h-[95vh]" : "max-w-5xl w-full max-h-[90vh]"
        } rounded-xl overflow-hidden transition-all duration-200`}
        style={{
          background: "hsl(var(--surface-8))",
          border: "1px solid hsl(var(--border-20))",
        }}
      >
        {/* ── Header (sticky) ── */}
        <div
          className="flex-none px-6 pt-4 pb-0 border-b"
          style={{ background: "hsl(var(--surface-8))", borderColor: "hsl(var(--border-20))" }}
        >
          {/* Action buttons row */}
          <div className="flex items-center gap-1 mb-3">
            <button
              onClick={() => setIsMaximized((v) => !v)}
              className={iconBtnClass + " hover:bg-white/5"}
              style={iconBtnStyle(isMaximized)}
              title={isMaximized ? "Restore size" : "Maximize"}
              data-testid="qd-btn-maximize"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setShowPopout(true)}
              className={iconBtnClass + " hover:bg-white/5"}
              style={iconBtnStyle()}
              title="Open in full view"
              data-testid="qd-btn-popout"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopy}
              className={iconBtnClass + " hover:bg-white/5"}
              style={iconBtnStyle(copyFeedback)}
              title="Copy quote number"
              data-testid="qd-btn-copy"
            >
              {copyFeedback ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Service badge + Quote number + Route | Close */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 mb-1">
                {/* Service + Direction badge */}
                {(service || shipmentType) && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{
                      background: "var(--brand-teal-soft)",
                      color: "var(--brand-teal)",
                      border: "1px solid rgba(20, 184, 166, 0.3)",
                    }}
                  >
                    <ServiceIcon service={service} className="w-3 h-3" />
                    {getServiceLabel(service, shipmentType)}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold font-mono text-[var(--brand-teal)]">{quoteNumber}</h2>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                {pol}
                <span className="text-muted-foreground/50">→</span>
                {pod}
                <span className="text-muted-foreground/50">→</span>
                {destination}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-none">
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                data-testid="qd-close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex items-center gap-1 pb-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap mb-[-1px]"
                style={{
                  background: activeTab === tab.key ? "var(--brand-teal)" : "transparent",
                  color: activeTab === tab.key ? "#fff" : "hsl(var(--muted-55))",
                  border: activeTab === tab.key ? "1px solid var(--brand-teal)" : "1px solid transparent",
                }}
                data-testid={`qd-tab-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content (scrollable) ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Tab 1: Shipment Details */}
          {activeTab === "details" && (
            <div className="grid grid-cols-2 gap-4 p-6">
              {/* Left Column */}
              <div className="space-y-4">
                {/* Quote Overview */}
                <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                  <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Ship className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                    Quote Overview
                  </h3>
                  <div className="space-y-2">
                    {overviewRows.map(({ label, value }) => (
                      <div key={label} className="flex items-start gap-2">
                        <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "110px" }}>
                          {label}
                        </span>
                        <span className="text-xs text-foreground">{value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Addresses / Route */}
                <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                  <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                    Route
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-md p-3" style={{ background: "hsl(var(--surface-6))" }}>
                      <p className="text-[11px] font-bold text-muted-foreground mb-1">Origin</p>
                      <p className="text-xs text-foreground mb-2">{quoteData["Origin"] || "—"}</p>
                      <p className="text-[11px] font-bold text-muted-foreground mb-1">POL</p>
                      <p className="text-xs text-foreground">{pol}</p>
                    </div>
                    <div className="rounded-md p-3" style={{ background: "hsl(var(--surface-6))" }}>
                      <p className="text-[11px] font-bold text-muted-foreground mb-1">POD</p>
                      <p className="text-xs text-foreground mb-2">{pod}</p>
                      <p className="text-[11px] font-bold text-muted-foreground mb-1">Destination</p>
                      <p className="text-xs text-foreground">{quoteData["Destination"] || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                {/* Cargo Details */}
                <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                  <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                    Cargo Details
                  </h3>
                  <div className="space-y-2">
                    {cargoRows.map(({ label, value }) => (
                      <div key={label} className="flex items-start gap-2">
                        <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "110px" }}>
                          {label}
                        </span>
                        <span className="text-xs text-foreground">{value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Containers */}
                {cntrRows.length > 0 && (
                  <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                    <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Anchor className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                      Containers
                    </h3>
                    <div className="space-y-2">
                      {cntrRows.map(({ label, value }) => (
                        <div key={label} className="flex items-start gap-2">
                          <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "110px" }}>
                            {label}
                          </span>
                          <span className="text-xs text-foreground">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Service + Type info card */}
                <div className="rounded-lg p-4" style={{ background: "hsl(var(--surface-11))" }}>
                  <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <ServiceIcon service={service} className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                    Service Info
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "110px" }}>Service</span>
                      <span className="text-xs text-foreground font-semibold">{service || "—"}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "110px" }}>Shipment Type</span>
                      <span className="text-xs text-foreground font-semibold">{shipmentType || "—"}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-muted-foreground flex-none" style={{ width: "110px" }}>FCL/LCL</span>
                      <span className="text-xs text-foreground">{quoteData["Load Type"] || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Costs Breakdown (full QuoteCostSection with Summary, Print, Booked) */}
          {activeTab === "costs" && (
            <div className="p-4">
              <QuoteCostSection quoteNumber={quoteNumber} quoteData={quoteData} onBooked={onBooked} />
            </div>
          )}

          {/* Tab 3: Documents */}
          {activeTab === "documents" && <DocumentsTab quoteNumber={quoteNumber} />}

          {/* Tab 4: Terms & Conditions */}
          {activeTab === "terms" && <TermsTab quoteNumber={quoteNumber} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
