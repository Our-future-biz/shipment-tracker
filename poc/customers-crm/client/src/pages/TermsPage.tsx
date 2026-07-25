import React, { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, ArrowLeft, ChevronRight, FileText, Trash2, Check, X } from "lucide-react";

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       "#F9FAFB",
  surface:  "#FFFFFF",
  border:   "#E5E7EB",
  borderL:  "#F3F4F6",
  blue:     "#1D4ED8",
  blueL:    "#EFF6FF",
  blueBd:   "#BFDBFE",
  text:     "#111827",
  textSub:  "#374151",
  textMuted:"#6B7280",
  textLight:"#9CA3AF",
  red:      "#EF4444",
  redL:     "#FEF2F2",
  green:    "#16A34A",
  greenL:   "#F0FDF4",
};

interface Term {
  id: number;
  name: string;
  includes: string;
  excludes: string;
  updated_at: number;
}

// ── Detail view ───────────────────────────────────────────────────────────────
function TermDetail({ term, onBack }: { term: Term; onBack: () => void }) {
  const [name, setName]         = useState(term.name);
  const [includes, setIncludes] = useState(term.includes || "");
  const [excludes, setExcludes] = useState(term.excludes || "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [showSuccess, setShowSuccess] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchMut = useMutation({
    mutationFn: (patch: Partial<Term>) =>
      apiRequest("PATCH", `/api/terms-conditions/${term.id}`, patch).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terms-conditions"] });
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
    },
  });

  const autoSave = useCallback((patch: Partial<Term>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => patchMut.mutate(patch), 600);
  }, []);

  const handleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    patchMut.mutate({ name, includes, excludes }, {
      onSuccess: () => { setShowSuccess(true); },
    });
  };

  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/terms-conditions/${term.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terms-conditions"] });
      onBack();
    },
  });

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 28px" }}>

      {/* Success popup */}
      {showSuccess && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
          onClick={() => setShowSuccess(false)}>
          <div style={{ background: C.surface, borderRadius: 16, padding: "36px 40px", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", maxWidth: 360 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.greenL, border: `2px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Check style={{ width: 26, height: 26, color: C.green }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>Saved!</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24 }}>All information has been saved successfully.</div>
            <button onClick={() => setShowSuccess(false)}
              style={{ padding: "10px 28px", background: C.blue, border: "none", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#fff" }}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textSub }}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <input
            value={name}
            onChange={e => { setName(e.target.value); autoSave({ name: e.target.value }); }}
            style={{ fontSize: 24, fontWeight: 800, color: C.text, border: "none", outline: "none", background: "transparent", width: "100%", fontFamily: "inherit" }}
            placeholder="Condition name…"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saveState === "saving" && <span style={{ fontSize: 11, color: C.textLight }}>Saving…</span>}
          {saveState === "saved" && (
            <span style={{ fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 4 }}>
              <Check style={{ width: 12, height: 12 }} /> Saved
            </span>
          )}
          <button onClick={handleSave} disabled={patchMut.isPending}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", background: C.blue, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff" }}>
            <Check style={{ width: 13, height: 13 }} /> Save
          </button>
          <button onClick={() => { if (confirm(`Delete "${term.name}"?`)) deleteMut.mutate(); }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.textLight }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.red; (e.currentTarget as HTMLElement).style.color = C.red; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.textLight; }}>
            <Trash2 style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* Text fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Rate offer includes */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.borderL}`, background: C.greenL, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>Rate offer includes</span>
          </div>
          <textarea
            value={includes}
            onChange={e => { setIncludes(e.target.value); autoSave({ includes: e.target.value }); }}
            placeholder="Enter what is included in the rate offer…&#10;e.g. Ocean freight, port handling charges, basic customs clearance, delivery to final destination"
            rows={10}
            style={{
              width: "100%", padding: "16px 20px", fontSize: 13, border: "none", outline: "none",
              resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
              color: C.text, background: C.surface, lineHeight: 1.6,
              minHeight: 200,
            }}
          />
        </div>

        {/* Rate offer excludes */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.borderL}`, background: C.redL, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#DC2626" }}>Rate offer excludes</span>
          </div>
          <textarea
            value={excludes}
            onChange={e => { setExcludes(e.target.value); autoSave({ excludes: e.target.value }); }}
            placeholder="Enter what is excluded from the rate offer…&#10;e.g. Insurance, duties and taxes, warehousing, special handling for hazardous goods"
            rows={10}
            style={{
              width: "100%", padding: "16px 20px", fontSize: 13, border: "none", outline: "none",
              resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
              color: C.text, background: C.surface, lineHeight: 1.6,
              minHeight: 200,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────
function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (term: Term) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/terms-conditions", { name: name.trim() }).then(r => {
      if (!r.ok) return r.json().then((e: any) => Promise.reject(e.error));
      return r.json();
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/terms-conditions"] });
      onCreate(data);
    },
    onError: (e: any) => setError(String(e)),
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.surface, borderRadius: 14, padding: "28px 28px 24px", width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Create new condition</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, padding: 4 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.textMuted, display: "block", marginBottom: 6 }}>Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter" && name.trim()) createMut.mutate(); }}
            placeholder="e.g. RAIL IMPORT"
            style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1.5px solid ${error ? C.red : C.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
          {error && <div style={{ fontSize: 11, color: C.red, marginTop: 5 }}>{error}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: "9px 18px", background: "none", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.textSub }}>
            Cancel
          </button>
          <button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}
            style={{ padding: "9px 20px", background: name.trim() ? C.blue : C.textLight, border: "none", borderRadius: 8, cursor: name.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 700, color: "#fff" }}>
            {createMut.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main list page ────────────────────────────────────────────────────────────
export default function TermsPage() {
  const [selected, setSelected] = useState<Term | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: terms = [], isLoading } = useQuery<Term[]>({
    queryKey: ["/api/terms-conditions"],
    queryFn: () => apiRequest("GET", "/api/terms-conditions").then(r => r.json()),
    staleTime: 10000,
  });

  if (selected) {
    return <TermDetail term={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 28px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>Terms & Conditions</h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "6px 0 0" }}>
            Manage rate offer conditions for each service type
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", background: C.blue, border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", boxShadow: "0 2px 8px rgba(29,78,216,0.25)" }}>
          <Plus style={{ width: 15, height: 15 }} /> Create new
        </button>
      </div>

      {/* List */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        {/* Column header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 32px", padding: "9px 20px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          {["Service type", "Last updated", ""].map(h => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.textMuted }}>{h}</div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 13, color: C.textLight }}>Loading…</div>
        ) : terms.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <FileText style={{ width: 32, height: 32, color: C.textLight, margin: "0 auto 10px" }} />
            <div style={{ fontSize: 14, color: C.textMuted, fontWeight: 600 }}>No conditions yet</div>
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>Click "+ Create new" to add your first condition</div>
          </div>
        ) : terms.map((t, i) => (
          <div key={t.id}
            onClick={() => setSelected(t)}
            style={{ display: "grid", gridTemplateColumns: "1fr 160px 32px", padding: "15px 20px", borderBottom: i < terms.length - 1 ? `1px solid ${C.borderL}` : "none", cursor: "pointer", transition: "background 0.1s", alignItems: "center", background: "none" }}
            onMouseEnter={e => (e.currentTarget.style.background = C.blueL)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
            {/* Name */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.blueL, border: `1px solid ${C.blueBd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FileText style={{ width: 15, height: 15, color: C.blue }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t.name}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {t.includes ? "✓ Includes set" : "No includes"} · {t.excludes ? "✓ Excludes set" : "No excludes"}
                </div>
              </div>
            </div>
            {/* Last updated */}
            <div style={{ fontSize: 12, color: C.textMuted }}>
              {t.updated_at ? new Date(t.updated_at).toLocaleDateString("cs-CZ") : "—"}
            </div>
            {/* Arrow */}
            <ChevronRight style={{ width: 16, height: 16, color: C.textLight }} />
          </div>
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={term => { setShowCreate(false); setSelected(term); }}
        />
      )}
    </div>
  );
}
