/**
 * QuoteLifecycle.tsx
 * Full quote status lifecycle system — dropdown, modals, timeline panel.
 */
import React, { useRef, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ChevronDown, Check, X, AlertCircle, Clock, TrendingUp,
  CheckCircle2, XCircle, RotateCcw, Send, MessageSquare,
  Star, CalendarClock, Loader2, ChevronRight, Info,
  ThumbsUp, ThumbsDown, RefreshCw, Eye, Hourglass,
} from "lucide-react";

// ─── Design tokens (aligned with NewQuoteWorkflow) ────────────────────────────
const C = {
  blue: "#2563EB", blueL: "#EFF6FF", blueBd: "#BFDBFE",
  text: "#0F172A", textSub: "#374151", textMuted: "#6B7280", textLight: "#9CA3AF",
  border: "#E2E8F0", borderL: "#F1F5F9", bg: "#F8FAFC", surface: "#FFFFFF",
  green: "#16A34A", greenL: "#F0FDF4", greenBd: "#BBF7D0",
  red: "#DC2626", redL: "#FEF2F2", redBd: "#FECACA",
  amber: "#D97706", amberL: "#FFFBEB", amberBd: "#FDE68A",
  purple: "#7C3AED", purpleL: "#F5F3FF", purpleBd: "#DDD6FE",
  navy: "#1E293B",
};

// ─── Status config ─────────────────────────────────────────────────────────────
export type QuoteStatus =
  | "draft" | "ready_to_send" | "quoted"
  | "feedback" | "revised" | "won" | "lost" | "expired";

export type Substatus = "under_review" | "negotiation" | "waiting_for_customer" | "rate_revision_requested";

interface StatusConfig {
  id: QuoteStatus;
  label: string;
  color: string;
  bg: string;
  border: string;
  dotColor: string;
  icon: React.ReactNode;
  description: string;
  winProb: number;
  canTransitionTo: QuoteStatus[];
  requiresModal: boolean;
}

const STATUS_CONFIG: Record<QuoteStatus, StatusConfig> = {
  draft: {
    id: "draft", label: "Draft", color: "#6B7280", bg: "#F3F4F6", border: "#D1D5DB",
    dotColor: "#9CA3AF", winProb: 10,
    icon: <PenIcon size={12} />,
    description: "Being prepared internally",
    canTransitionTo: ["ready_to_send", "lost"],
    requiresModal: false,
  },
  ready_to_send: {
    id: "ready_to_send", label: "Ready to Send", color: "#1D4ED8", bg: "#DBEAFE", border: "#93C5FD",
    dotColor: "#3B82F6", winProb: 20,
    icon: <Send size={12} />,
    description: "Internal review stage",
    canTransitionTo: ["quoted", "draft", "lost"],
    requiresModal: false,
  },
  quoted: {
    id: "quoted", label: "Quoted", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE",
    dotColor: "#2563EB", winProb: 30,
    icon: <Send size={12} />,
    description: "Sent to customer",
    canTransitionTo: ["feedback", "revised", "won", "lost"],
    requiresModal: true,
  },
  feedback: {
    id: "feedback", label: "Feedback", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A",
    dotColor: "#F59E0B", winProb: 60,
    icon: <MessageSquare size={12} />,
    description: "Customer communication stage",
    canTransitionTo: ["revised", "won", "lost", "quoted"],
    requiresModal: false,
  },
  revised: {
    id: "revised", label: "Revised", color: "#6D28D9", bg: "#F5F3FF", border: "#DDD6FE",
    dotColor: "#7C3AED", winProb: 50,
    icon: <RotateCcw size={12} />,
    description: "Modified after being sent",
    canTransitionTo: ["quoted", "won", "lost"],
    requiresModal: false,
  },
  won: {
    id: "won", label: "Won", color: "#15803D", bg: "#F0FDF4", border: "#86EFAC",
    dotColor: "#16A34A", winProb: 100,
    icon: <CheckCircle2 size={12} />,
    description: "Customer accepted",
    canTransitionTo: [],
    requiresModal: true,
  },
  lost: {
    id: "lost", label: "Lost", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA",
    dotColor: "#DC2626", winProb: 0,
    icon: <XCircle size={12} />,
    description: "Customer rejected",
    canTransitionTo: ["draft"],
    requiresModal: true,
  },
  expired: {
    id: "expired", label: "Expired", color: "#374151", bg: "#F3F4F6", border: "#D1D5DB",
    dotColor: "#6B7280", winProb: 0,
    icon: <Hourglass size={12} />,
    description: "Validity expired",
    canTransitionTo: ["draft", "revised"],
    requiresModal: false,
  },
};

function PenIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

const LOST_REASONS = {
  "Pricing": ["Price too high", "Competitor cheaper", "Margin too low"],
  "Operational": ["Transit time too long", "No suitable schedule", "Capacity unavailable"],
  "Customer": ["Shipment canceled", "Customer postponed shipment", "Customer inactive", "No response"],
  "Internal": ["Quote sent too late", "Missing follow-up", "Incorrect quotation"],
  "Commercial": ["Existing supplier retained", "Lost tender", "Customer chose direct carrier"],
};

const FEEDBACK_SUBSTATUSES: { id: Substatus; label: string }[] = [
  { id: "under_review", label: "Under Review" },
  { id: "negotiation", label: "Negotiation" },
  { id: "waiting_for_customer", label: "Waiting for Customer" },
  { id: "rate_revision_requested", label: "Rate Revision Requested" },
];

// ─── Utility ──────────────────────────────────────────────────────────────────
function fmtTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function daysSince(ts: number) {
  return Math.floor((Date.now() - ts) / 86400000);
}

// ─── StatusBadge (standalone, no interactivity) ───────────────────────────────
export function StatusBadge({ status, size = "sm" }: { status: QuoteStatus; size?: "sm" | "md" }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const pad = size === "md" ? "5px 12px" : "3px 9px";
  const fs = size === "md" ? 12 : 11;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: fs, fontWeight: 700, padding: pad, borderRadius: 20,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dotColor, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// ─── Win Probability Bar ──────────────────────────────────────────────────────
function WinProbBar({ prob }: { prob: number }) {
  const color = prob >= 80 ? C.green : prob >= 50 ? C.amber : prob >= 20 ? C.blue : C.textLight;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#E5E7EB", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${prob}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: "right" as const }}>{prob}%</span>
    </div>
  );
}

// ─── Transition Modal ─────────────────────────────────────────────────────────
interface TransitionModalProps {
  targetStatus: QuoteStatus;
  currentQuoteRef: string;
  validityDays: number;
  onConfirm: (payload: {
    quote_status: QuoteStatus; substatus?: string; lost_reason?: string;
    lost_comment?: string; validity_days?: number; comment?: string;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}

function TransitionModal({ targetStatus, currentQuoteRef, validityDays, onConfirm, onCancel, saving }: TransitionModalProps) {
  const cfg = STATUS_CONFIG[targetStatus];
  const [lostReason, setLostReason] = useState("");
  const [lostComment, setLostComment] = useState("");
  const [comment, setComment] = useState("");
  const [validity, setValidity] = useState(validityDays || 15);
  const [substatus, setSubstatus] = useState<string>("under_review");

  const canSubmit = targetStatus !== "lost" || !!lostReason;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm({
      quote_status: targetStatus,
      substatus: targetStatus === "feedback" ? substatus : undefined,
      lost_reason: targetStatus === "lost" ? lostReason : undefined,
      lost_comment: targetStatus === "lost" ? lostComment : undefined,
      validity_days: targetStatus === "quoted" ? validity : undefined,
      comment: comment || undefined,
    });
  }

  return (
    <div style={{
      position: "fixed" as const, inset: 0, background: "rgba(15,23,42,0.45)",
      zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, backdropFilter: "blur(2px)",
    }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: C.surface, borderRadius: 14, width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 22px 16px", borderBottom: `1px solid ${C.borderL}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: cfg.bg, border: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color }}>
              {cfg.icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                {targetStatus === "won" ? "Mark as Won" :
                 targetStatus === "lost" ? "Mark as Lost" :
                 targetStatus === "quoted" ? "Mark as Quoted" :
                 targetStatus === "feedback" ? "Mark as Feedback" :
                 `Transition to ${cfg.label}`}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{currentQuoteRef}</div>
            </div>
          </div>
          <button type="button" onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: 4, borderRadius: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column" as const, gap: 16 }}>

          {/* QUOTED — validity */}
          {targetStatus === "quoted" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 6 }}>
                Quotation validity (days) *
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[7, 10, 15, 21, 30].map(d => (
                  <button key={d} type="button" onClick={() => setValidity(d)}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: 7, border: `1.5px solid ${validity === d ? C.blue : C.border}`,
                      background: validity === d ? C.blueL : C.surface, color: validity === d ? C.blue : C.textSub,
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>{d}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <CalendarClock size={11} />
                Expires: {fmtDate(Date.now() + validity * 86400000)}
              </div>
            </div>
          )}

          {/* WON */}
          {targetStatus === "won" && (
            <div style={{ background: C.greenL, border: `1px solid ${C.greenBd}`, borderRadius: 9, padding: "12px 14px", fontSize: 12, color: C.green, display: "flex", gap: 9, alignItems: "flex-start" }}>
              <CheckCircle2 size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>Confirm customer accepted</div>
                <div style={{ color: "#166534", opacity: 0.8 }}>This will mark the quote as closed-won and update your pipeline KPIs.</div>
              </div>
            </div>
          )}

          {/* FEEDBACK — substatus */}
          {targetStatus === "feedback" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 6 }}>
                Substatus *
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                {FEEDBACK_SUBSTATUSES.map(s => (
                  <button key={s.id} type="button" onClick={() => setSubstatus(s.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 8,
                      border: `1.5px solid ${substatus === s.id ? C.amber : C.border}`,
                      background: substatus === s.id ? C.amberL : C.surface,
                      color: substatus === s.id ? C.amber : C.textSub,
                      fontSize: 12, fontWeight: substatus === s.id ? 700 : 500, cursor: "pointer", textAlign: "left" as const,
                    }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${substatus === s.id ? C.amber : "#D1D5DB"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {substatus === s.id && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />}
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LOST — reason */}
          {targetStatus === "lost" && (
            <>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 8 }}>
                  Lost reason *
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {Object.entries(LOST_REASONS).map(([category, reasons]) => (
                    <div key={category}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: C.textLight, marginBottom: 4 }}>{category}</div>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                        {reasons.map(r => (
                          <button key={r} type="button" onClick={() => setLostReason(r)}
                            style={{
                              padding: "4px 10px", borderRadius: 20, border: `1.5px solid ${lostReason === r ? C.red : C.border}`,
                              background: lostReason === r ? C.redL : C.surface,
                              color: lostReason === r ? C.red : C.textSub,
                              fontSize: 11, fontWeight: lostReason === r ? 700 : 500, cursor: "pointer",
                            }}>{r}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 6 }}>
                  Additional comment (optional)
                </div>
                <textarea value={lostComment} onChange={e => setLostComment(e.target.value)}
                  placeholder="Add context about why this quote was lost..."
                  rows={3}
                  style={{ width: "100%", padding: "9px 11px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", resize: "vertical" as const, boxSizing: "border-box" as const, color: C.text }}
                  onFocus={e => e.target.style.borderColor = C.blue}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
            </>
          )}

          {/* Comment for all non-lost transitions */}
          {targetStatus !== "lost" && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 6 }}>
                Comment <span style={{ fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 }}>(optional)</span>
              </div>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Add a note to the timeline..."
                rows={2}
                style={{ width: "100%", padding: "9px 11px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", resize: "vertical" as const, boxSizing: "border-box" as const, color: C.text }}
                onFocus={e => e.target.style.borderColor = C.blue}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px 18px", borderTop: `1px solid ${C.borderL}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit || saving}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: !canSubmit || saving ? "#D1D5DB" : targetStatus === "lost" ? C.red : targetStatus === "won" ? C.green : C.blue,
              color: "#fff", fontSize: 13, fontWeight: 700, cursor: canSubmit && !saving ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            {targetStatus === "lost" ? "Mark as Lost" :
             targetStatus === "won" ? "Confirm Won" :
             targetStatus === "quoted" ? "Mark as Quoted" :
             `Confirm`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main QuoteStatusDropdown ─────────────────────────────────────────────────
interface QuoteStatusDropdownProps {
  quoteId: number | null;
  quoteRef: string;
  currentStatus: QuoteStatus;
  validityDays: number;
  onStatusChange?: (newStatus: QuoteStatus, row: any) => void;
}

export function QuoteStatusDropdown({
  quoteId, quoteRef, currentStatus, validityDays, onStatusChange,
}: QuoteStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<QuoteStatus | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const cfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.draft;

  const mutation = useMutation({
    mutationFn: (payload: any) => apiRequest("PATCH", `/api/sales-quotes/${quoteId}/status`, payload),
    onSuccess: (row: any) => {
      setTargetStatus(null);
      qc.invalidateQueries({ queryKey: ["/api/sales-quotes"] });
      if (onStatusChange) onStatusChange(row.quote_status as QuoteStatus, row);
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!quoteId) return <StatusBadge status={currentStatus} />;

  const allTransitions = cfg.canTransitionTo;

  function handleSelect(s: QuoteStatus) {
    setOpen(false);
    const targetCfg = STATUS_CONFIG[s];
    if (targetCfg.requiresModal) {
      setTargetStatus(s);
    } else {
      mutation.mutate({ quote_status: s });
      if (onStatusChange) onStatusChange(s, { quote_status: s });
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" as const }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 10px 5px 8px",
          borderRadius: 20,
          background: cfg.bg,
          color: cfg.color,
          border: `1.5px solid ${cfg.border}`,
          cursor: "pointer",
          fontSize: 11, fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          transition: "box-shadow 0.12s",
          boxShadow: open ? `0 0 0 3px ${cfg.border}` : "none",
          whiteSpace: "nowrap" as const,
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 0 3px ${cfg.border}`)}
        onMouseLeave={e => { if (!open) e.currentTarget.style.boxShadow = "none"; }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dotColor, flexShrink: 0 }} />
        {cfg.label}
        <ChevronDown size={11} style={{ marginLeft: 2, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute" as const, top: "calc(100% + 6px)", right: 0,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.14)", zIndex: 300, minWidth: 260,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${C.borderL}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: C.textLight }}>
              Quote status
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
              Current: <strong style={{ color: cfg.color }}>{cfg.label}</strong>
            </div>
          </div>

          {/* All statuses */}
          <div style={{ padding: "6px 0" }}>
            {(Object.values(STATUS_CONFIG) as StatusConfig[]).map(s => {
              const isCurrent = s.id === currentStatus;
              const isAllowed = allTransitions.includes(s.id);
              const disabled = isCurrent || !isAllowed;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && handleSelect(s.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px", background: isCurrent ? `${s.bg}` : "none",
                    border: "none", cursor: disabled ? "default" : "pointer",
                    opacity: !isCurrent && !isAllowed ? 0.35 : 1,
                    textAlign: "left" as const,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!disabled) (e.currentTarget.style.background = s.bg); }}
                  onMouseLeave={e => { if (!isCurrent) (e.currentTarget.style.background = "none"); }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dotColor, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: C.textLight, marginTop: 1 }}>{s.description}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isCurrent && (
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: s.color, background: s.bg, border: `1px solid ${s.border}`, padding: "1px 6px", borderRadius: 10 }}>
                        Current
                      </span>
                    )}
                    {!isCurrent && isAllowed && <ChevronRight size={12} style={{ color: C.textLight }} />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer — win probability */}
          <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.borderL}`, background: C.bg }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 5 }}>
              Win probability
            </div>
            <WinProbBar prob={cfg.winProb} />
          </div>
        </div>
      )}

      {/* Transition Modal */}
      {targetStatus && (
        <TransitionModal
          targetStatus={targetStatus}
          currentQuoteRef={quoteRef}
          validityDays={validityDays}
          onConfirm={payload => mutation.mutate(payload)}
          onCancel={() => setTargetStatus(null)}
          saving={mutation.isPending}
        />
      )}
    </div>
  );
}

// ─── StatusTimeline Panel ─────────────────────────────────────────────────────
const TIMELINE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft created",
  ready_to_send: "Ready to send",
  quoted: "Quote sent to customer",
  feedback: "Customer feedback",
  revised: "Revision sent",
  won: "Quote won",
  lost: "Quote lost",
  expired: "Quote expired",
};

const SUBSTATUS_LABELS: Record<string, string> = {
  under_review: "Under Review",
  negotiation: "Negotiation",
  waiting_for_customer: "Waiting for Customer",
  rate_revision_requested: "Rate Revision Requested",
};

interface TimelineEntry {
  status: QuoteStatus;
  substatus?: string;
  ts: number;
  user: string;
  comment?: string;
  lost_reason?: string;
}

interface StatusTimelinePanelProps {
  quoteId: number | null;
  quoteRef: string;
  currentStatus: QuoteStatus;
  timeline: TimelineEntry[];
  validityDays: number;
  sentAt: number | null;
  winProbability: number;
  lostReason?: string;
  substatus?: string;
  onStatusChange?: (newStatus: QuoteStatus, row: any) => void;
  /** When true: hide status card, win probability, validity, follow-up — show only activity */
  sidebarMode?: boolean;
}

export function StatusTimelinePanel({
  quoteId, quoteRef, currentStatus, timeline, validityDays,
  sentAt, winProbability, lostReason, substatus, onStatusChange, sidebarMode = false,
}: StatusTimelinePanelProps) {
  const cfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.draft;

  // Validity expiry
  const expiryTs = sentAt ? sentAt + validityDays * 86400000 : null;
  const isExpired = expiryTs ? Date.now() > expiryTs : false;
  const daysLeft = expiryTs ? Math.ceil((expiryTs - Date.now()) / 86400000) : null;

  // Follow-up reminders
  const lastEntry = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const staleDays = lastEntry ? daysSince(lastEntry.ts) : 0;
  const showFollowUpReminder =
    (currentStatus === "quoted" && staleDays >= 3) ||
    (currentStatus === "feedback" && staleDays >= 7);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>

      {!sidebarMode && (<>
      {/* ── Status card ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.borderL}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted }}>
            Status
          </span>
        </div>
        <div style={{ padding: "14px" }}>
          <QuoteStatusDropdown
            quoteId={quoteId}
            quoteRef={quoteRef}
            currentStatus={currentStatus}
            validityDays={validityDays}
            onStatusChange={onStatusChange}
          />
          {/* Substatus chip */}
          {currentStatus === "feedback" && substatus && (
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: C.amberL, color: C.amber, border: `1px solid ${C.amberBd}`, letterSpacing: "0.05em" }}>
                {SUBSTATUS_LABELS[substatus] || substatus}
              </span>
            </div>
          )}
          {/* Lost reason */}
          {currentStatus === "lost" && lostReason && (
            <div style={{ marginTop: 8, fontSize: 11, color: C.red, display: "flex", alignItems: "center", gap: 5 }}>
              <XCircle size={11} /> {lostReason}
            </div>
          )}
        </div>
      </div>

      {/* ── Win probability ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <TrendingUp size={12} /> Win probability
        </div>
        <WinProbBar prob={winProbability} />
      </div>

      {/* ── Validity ── */}
      {sentAt && (
        <div style={{
          background: isExpired ? C.redL : daysLeft !== null && daysLeft <= 3 ? C.amberL : C.surface,
          border: `1px solid ${isExpired ? C.redBd : daysLeft !== null && daysLeft <= 3 ? C.amberBd : C.border}`,
          borderRadius: 10, padding: "12px 14px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <CalendarClock size={12} /> Validity
          </div>
          <div style={{ fontSize: 12, color: isExpired ? C.red : C.textSub, fontWeight: 600 }}>
            {isExpired
              ? "Expired"
              : daysLeft !== null && daysLeft <= 3
                ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`
                : `${validityDays} days · expires ${fmtDate(expiryTs!)}`}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
            Sent {fmtDate(sentAt)}
          </div>
        </div>
      )}

      {/* ── Follow-up reminder ── */}
      {showFollowUpReminder && (
        <div style={{ background: C.amberL, border: `1px solid ${C.amberBd}`, borderRadius: 10, padding: "11px 14px", display: "flex", gap: 9, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.amber }}>Follow-up required</div>
            <div style={{ fontSize: 11, color: "#78350F", marginTop: 2 }}>
              {currentStatus === "quoted"
                ? `No customer feedback in ${staleDays} days`
                : `In feedback stage for ${staleDays} days`}
            </div>
          </div>
        </div>
      )}
      </>)}{/* end !sidebarMode */}

      {/* ── Timeline ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.borderL}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted }}>
            Activity
          </span>
        </div>
        <div style={{ padding: "12px 14px" }}>
          {timeline.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textLight, textAlign: "center" as const, padding: "10px 0" }}>
              No activity yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
              {[...timeline].reverse().map((entry, idx) => {
                const sCfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.draft;
                const isLast = idx === timeline.length - 1;
                return (
                  <div key={idx} style={{ display: "flex", gap: 10, position: "relative" as const }}>
                    {/* Dot + line */}
                    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 20 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: idx === 0 ? sCfg.dotColor : "#D1D5DB", border: `2px solid ${idx === 0 ? sCfg.dotColor : "#E5E7EB"}`, flexShrink: 0, marginTop: 3 }} />
                      {!isLast && <div style={{ width: 1.5, flex: 1, background: "#E5E7EB", minHeight: 20, margin: "3px 0" }} />}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: idx === 0 ? sCfg.color : C.textSub }}>
                        {TIMELINE_STATUS_LABELS[entry.status] || entry.status}
                        {entry.substatus && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: C.amber, marginLeft: 6, background: C.amberL, padding: "1px 6px", borderRadius: 8 }}>
                            {SUBSTATUS_LABELS[entry.substatus] || entry.substatus}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: C.textLight, marginTop: 1 }}>
                        {fmtTs(entry.ts)} · {entry.user}
                      </div>
                      {entry.lost_reason && (
                        <div style={{ fontSize: 11, color: C.red, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <XCircle size={10} /> {entry.lost_reason}
                        </div>
                      )}
                      {entry.comment && (
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, padding: "5px 8px", background: C.bg, borderRadius: 6, borderLeft: `2.5px solid ${C.borderL}` }}>
                          {entry.comment}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quote Lifecycle Flow Visualizer (compact, for sidebar) ───────────────────
export function LifecycleFlowBar({ currentStatus, compact = false }: { currentStatus: QuoteStatus; compact?: boolean }) {
  const FLOW: QuoteStatus[] = ["draft", "ready_to_send", "quoted", "feedback", "won"];
  const specialEnd = currentStatus === "lost" || currentStatus === "expired" || currentStatus === "revised";
  const currentIdx = FLOW.indexOf(currentStatus);

  const dotSize = compact ? 18 : 24;
  const lineH = compact ? 1 : 1.5;
  const showLabels = true; // always show labels under each status dot

  const flowContent = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: compact ? 2 : 3 }}>
      {FLOW.map((s, i) => {
        const sCfg = STATUS_CONFIG[s];
        const isActive = s === currentStatus && !specialEnd;
        const isPast = !specialEnd && currentIdx > i;
        return (
          <React.Fragment key={s}>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: showLabels ? 4 : 0 }}>
              <div style={{
                width: dotSize, height: dotSize, borderRadius: "50%",
                background: isActive ? sCfg.dotColor : isPast ? "#D1FAE5" : "#F3F4F6",
                border: `2px solid ${isActive ? sCfg.dotColor : isPast ? "#6EE7B7" : "#E5E7EB"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: isActive ? "#fff" : isPast ? C.green : "#D1D5DB",
                title: sCfg.label,
              } as any}>
                {isPast ? <Check size={compact ? 8 : 10} /> : <span style={{ width: compact ? 4 : 6, height: compact ? 4 : 6, borderRadius: "50%", background: isActive ? "#fff" : "#D1D5DB" }} />}
              </div>
              {showLabels && (
                <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: isActive ? sCfg.color : isPast ? C.green : C.textLight, textAlign: "center" as const, lineHeight: 1.2, maxWidth: 40 }}>
                  {sCfg.label.replace(" to ", "\nto ")}
                </span>
              )}
            </div>
            {i < FLOW.length - 1 && (
              <div style={{ flex: 1, height: lineH, background: isPast ? "#6EE7B7" : "#E5E7EB", marginTop: dotSize / 2 - lineH / 2, minWidth: compact ? 14 : 8 }} />
            )}
          </React.Fragment>
        );
      })}
      {specialEnd && (
        <>
          <div style={{ flex: 1, height: lineH, background: "#E5E7EB", marginTop: dotSize / 2 - lineH / 2, minWidth: compact ? 14 : 8 }} />
          <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: showLabels ? 4 : 0 }}>
            <div style={{
              width: dotSize, height: dotSize, borderRadius: "50%",
              background: STATUS_CONFIG[currentStatus].dotColor,
              border: `2px solid ${STATUS_CONFIG[currentStatus].dotColor}`,
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
            }}>
              {STATUS_CONFIG[currentStatus].icon}
            </div>
            {showLabels && (
              <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: STATUS_CONFIG[currentStatus].color, textAlign: "center" as const }}>
                {STATUS_CONFIG[currentStatus].label}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (compact) return flowContent;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: C.textMuted, marginBottom: 10 }}>
        Lifecycle
      </div>
      {flowContent}
    </div>
  );
}
