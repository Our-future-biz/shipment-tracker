import { useState, useMemo, useEffect } from "react";
import { X, Package2, Cpu, AlertTriangle, ArrowLeft, Check } from "lucide-react";
import { useShipments } from "@/lib/shipment-context";
import { apiRequest, queryClient } from "@/lib/queryClient";

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CHF", "CNY", "JPY"] as const;

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection / Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
] as const;

interface MasterJobDetailModalProps {
  masterNumber: string;
  onClose: () => void;
}

type Tab = "shipments" | "machine";
type MachineStep = "input" | "review";

interface ExistingCost {
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
}

export function MasterJobDetailModal({ masterNumber, onClose }: MasterJobDetailModalProps) {
  const { data: shipments } = useShipments();
  const [tab, setTab] = useState<Tab>("shipments");

  // Find every shipment whose Master job equals this MCZ
  const masterShipments = useMemo(
    () => shipments.filter((s) => (s.extra?.["Master job"] || "").trim() === masterNumber),
    [shipments, masterNumber]
  );

  // Build a snapshot of computed totals per shipment (matches FullSheetTab logic)
  const rows = useMemo(() => {
    return masterShipments.map((s) => {
      const dimsJson = (s.extra?.["_dimensions"] || "").trim();
      let weightKg = 0, volCbm = 0;
      if (dimsJson) {
        try {
          const arr = JSON.parse(dimsJson) as Array<any>;
          for (const r of arr) {
            const colli = parseFloat(r.colli || "0") || 0;
            const L = parseFloat(r.length || "0") || 0;
            const W = parseFloat(r.width || "0") || 0;
            const H = parseFloat(r.height || "0") || 0;
            const wPiece = parseFloat(r.weightPerPiece || "0") || 0;
            const vPiece = r.volumePerPiece ? parseFloat(r.volumePerPiece) : (L * W * H) / 1_000_000;
            weightKg += colli * wPiece;
            volCbm += colli * (isNaN(vPiece) ? 0 : vPiece);
          }
        } catch { /* ignore */ }
      }
      const manualTons = parseFloat(s.extra?.["Total Weight In Tons"] || "0") || 0;
      const manualCbm = parseFloat(s.extra?.["Total Volume In CBM"] || "0") || 0;
      const tons = weightKg > 0 ? weightKg / 1000 : manualTons;
      const cbm = volCbm > 0 ? volCbm : manualCbm;
      const freightTon = Math.max(tons, cbm);
      return {
        shipment: s,
        jobNumber: s.jobNumber,
        dimsJson,
        tons,
        cbm,
        freightTon,
      };
    });
  }, [masterShipments]);

  const totalFreightTons = rows.reduce((sum, r) => sum + r.freightTon, 0);

  return (
    <div
      onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "hsl(var(--surface-10))", border: "1px solid hsl(var(--surface-18))", borderRadius: 8, width: 1100, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid hsl(var(--surface-15))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "var(--brand-orange)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>{masterNumber}</span>
            <span style={{ color: "hsl(var(--muted-50))", fontSize: 11 }}>· master job</span>
            <span style={{ color: "hsl(var(--muted-65))", fontSize: 11 }}>· {rows.length} shipment{rows.length === 1 ? "" : "s"}</span>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "hsl(var(--muted-50))", cursor: "pointer", padding: 4 }} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid hsl(var(--surface-15))", padding: "0 8px" }}>
          <TabBtn active={tab === "shipments"} onClick={() => setTab("shipments")} icon={<Package2 className="w-3.5 h-3.5" />} label="Shipments" />
          <TabBtn active={tab === "machine"} onClick={() => setTab("machine")} icon={<Cpu className="w-3.5 h-3.5" />} label="Machine Processing" />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {tab === "shipments" && <ShipmentsTab rows={rows} totalFreightTons={totalFreightTons} />}
          {tab === "machine" && <MachineProcessingTab rows={rows} totalFreightTons={totalFreightTons} masterNumber={masterNumber} onDone={onClose} />}
        </div>
      </div>
    </div>
  );
}

// ─── Tab button ────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }) {
  return (
    <button
      onClick={onClick}
      data-testid={`mj-tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 14px",
        background: "transparent", border: "none",
        borderBottom: active ? "2px solid var(--brand-teal)" : "2px solid transparent",
        color: active ? "var(--brand-teal)" : "hsl(var(--muted-60))",
        cursor: "pointer", fontSize: 12, fontWeight: 600,
        transition: "color 120ms",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Shipments Tab ─────────────────────────────────────────────────
function ShipmentsTab({ rows, totalFreightTons }: { rows: DerivedRow[]; totalFreightTons: number; }) {
  const [openDimsRowIdx, setOpenDimsRowIdx] = useState<number | null>(null);
  const totalTons = rows.reduce((s, r) => s + r.tons, 0);
  const totalCbm = rows.reduce((s, r) => s + r.cbm, 0);

  if (rows.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "hsl(var(--muted-50))", fontSize: 12 }}>
        No shipments are attached to this master job yet.
      </div>
    );
  }

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "hsl(var(--surface-13))", borderBottom: "1px solid hsl(var(--surface-20))" }}>
            <Th>Internal Reference</Th>
            <Th>Dimensions</Th>
            <Th align="right">Total Weight In Tons</Th>
            <Th align="right">Total Volume In CBM</Th>
            <Th align="right">Freight Tons</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const dimsCount = (() => {
              if (!r.dimsJson) return 0;
              try { return (JSON.parse(r.dimsJson) as any[]).length; } catch { return 0; }
            })();
            return (
              <tr key={r.jobNumber} style={{ borderBottom: "1px solid hsl(var(--surface-15))" }}>
                <td style={{ padding: "10px 12px", color: "var(--brand-teal)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.jobNumber}</td>
                <td style={{ padding: "8px 12px" }}>
                  <button
                    onClick={() => setOpenDimsRowIdx(idx)}
                    disabled={!r.dimsJson}
                    data-testid={`mj-dims-${r.jobNumber}`}
                    style={{
                      padding: "5px 10px",
                      background: r.dimsJson ? "hsl(var(--surface-13))" : "transparent",
                      border: "1px solid " + (r.dimsJson ? "hsl(var(--surface-22))" : "hsl(var(--surface-15))"),
                      borderRadius: 4,
                      color: r.dimsJson ? "var(--brand-teal)" : "hsl(var(--muted-40))",
                      cursor: r.dimsJson ? "pointer" : "not-allowed",
                      fontSize: 11, fontWeight: 600,
                    }}
                  >
                    {r.dimsJson ? `${dimsCount} row${dimsCount === 1 ? "" : "s"} · view` : "no dimensions"}
                  </button>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "hsl(var(--fg-96))" }}>{r.tons > 0 ? r.tons.toFixed(3) : "—"}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "hsl(var(--fg-96))" }}>{r.cbm > 0 ? r.cbm.toFixed(3) : "—"}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.freightTon > 0 ? "var(--brand-teal)" : "var(--brand-red-strong)", fontWeight: 600 }}>{r.freightTon > 0 ? r.freightTon.toFixed(3) : "0.000"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "hsl(var(--surface-12))", borderTop: "2px solid hsl(var(--surface-20))" }}>
            <td colSpan={2} style={{ padding: "10px 12px", color: "hsl(var(--muted-65))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Total</td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "hsl(var(--fg-96))", fontWeight: 700 }}>{totalTons.toFixed(3)}</td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "hsl(var(--fg-96))", fontWeight: 700 }}>{totalCbm.toFixed(3)}</td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--brand-teal)", fontWeight: 700 }}>{totalFreightTons.toFixed(3)}</td>
          </tr>
        </tfoot>
      </table>

      {openDimsRowIdx !== null && rows[openDimsRowIdx]?.dimsJson && (
        <DimensionsViewer
          dimsJson={rows[openDimsRowIdx].dimsJson}
          jobNumber={rows[openDimsRowIdx].jobNumber}
          onClose={() => setOpenDimsRowIdx(null)}
        />
      )}
    </div>
  );
}

// helper type for ShipmentsTab — matches the shape returned by useMemo above
type DerivedRow = { shipment: any; jobNumber: string; dimsJson: string; tons: number; cbm: number; freightTon: number; };

// ─── Read-only Dimensions viewer (for Shipments tab) ───────────────
function DimensionsViewer({ dimsJson, jobNumber, onClose }: { dimsJson: string; jobNumber: string; onClose: () => void; }) {
  let rows: any[] = [];
  try { rows = JSON.parse(dimsJson); } catch { rows = []; }

  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "hsl(var(--surface-10))", border: "1px solid hsl(var(--surface-18))", borderRadius: 8, padding: 20, maxWidth: "95vw", width: 1000, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ color: "var(--brand-teal)", fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>
            Dimensions · <span style={{ color: "hsl(var(--muted-55))", fontFamily: "var(--font-mono)" }}>{jobNumber}</span>
          </h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "hsl(var(--muted-45))", cursor: "pointer" }}><X className="w-4 h-4" /></button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "hsl(var(--surface-13))", borderBottom: "1px solid hsl(var(--surface-20))" }}>
              {["Colli", "Length (cm)", "Width (cm)", "Height (cm)", "Weight Per Piece (KG)", "Volume Per Piece (CBM)", "Packing", "Stackable"].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "hsl(var(--muted-50))" }}>No dimension rows.</td></tr>}
            {rows.map((r, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid hsl(var(--surface-15))" }}>
                <Td>{r.colli || "—"}</Td>
                <Td>{r.length || "—"}</Td>
                <Td>{r.width || "—"}</Td>
                <Td>{r.height || "—"}</Td>
                <Td>{r.weightPerPiece || "—"}</Td>
                <Td>{r.volumePerPiece || "—"}</Td>
                <Td>{r.packing || "—"}</Td>
                <Td>{r.stackable || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Machine Processing Tab ────────────────────────────────────────
function MachineProcessingTab({ rows, totalFreightTons, masterNumber, onDone }: { rows: DerivedRow[]; totalFreightTons: number; masterNumber: string; onDone: () => void; }) {
  const [step, setStep] = useState<MachineStep>("input");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [currency, setCurrency] = useState<string>("CZK");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [category, setCategory] = useState<string>("freight");
  const [overwriteRows, setOverwriteRows] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<Record<string, ExistingCost | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Fetch existing values for the chosen category once we hit step 2
  useEffect(() => {
    if (step !== "review") return;
    (async () => {
      const map: Record<string, ExistingCost | undefined> = {};
      await Promise.all(rows.map(async (r) => {
        try {
          const resp = await apiRequest("GET", `/api/invoicing/${encodeURIComponent(r.jobNumber)}`);
          const data = await resp.json() as { costs: Array<ExistingCost & { category: string }> };
          const match = data.costs?.find((c) => c.category === category);
          if (match && match.realAmount?.trim()) {
            map[r.jobNumber] = { realAmount: match.realAmount, realCurrency: match.realCurrency, invoiceNumber: match.invoiceNumber };
          }
        } catch { /* ignore */ }
      }));
      setExisting(map);
    })();
  }, [step, category, rows]);

  // Validation
  const invValueNum = parseFloat(invoiceValue) || 0;
  const inputsValid = invValueNum > 0 && invoiceNumber.trim().length > 0 && totalFreightTons > 0;
  const multiplier = totalFreightTons > 0 ? invValueNum / totalFreightTons : 0;
  const zeroFreightShipments = rows.filter((r) => r.freightTon <= 0);
  const blockProceed = zeroFreightShipments.length > 0;

  const conflicts = rows.filter((r) => existing[r.jobNumber] && !overwriteRows.has(r.jobNumber));
  const canSubmit = !blockProceed && conflicts.length === 0 && !submitting;

  const toggleOverwrite = (jobNumber: string) => {
    setOverwriteRows((prev) => {
      const next = new Set(prev);
      if (next.has(jobNumber)) next.delete(jobNumber); else next.add(jobNumber);
      return next;
    });
  };

  async function handleProceed() {
    setSubmitting(true);
    setSubmitError("");
    try {
      // Push amount to each shipment's invoicing
      for (const r of rows) {
        if (r.freightTon <= 0) continue;
        const amt = (r.freightTon * multiplier).toFixed(2);
        // Skip if existing and not toggled to overwrite
        if (existing[r.jobNumber] && !overwriteRows.has(r.jobNumber)) continue;
        await apiRequest("POST", "/api/invoicing/costs", {
          jobNumber: r.jobNumber,
          category,
          realAmount: amt,
          realCurrency: currency,
          invoiceNumber: invoiceNumber.trim(),
          // Preserve other fields by leaving them unset — backend upsert keeps prior values? Backend overwrites; we send empty.
          estAmount: "",
          estCurrency: currency,
          vendor: "",
        });
        // Invalidate cached invoicing data for that job
        queryClient.invalidateQueries({ queryKey: [`/api/invoicing/${r.jobNumber}`] });
      }
      setSubmitDone(true);
      setTimeout(() => onDone(), 1100);
    } catch (e: any) {
      setSubmitError(e?.message || "Failed to upload to invoicing");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── STEP 1: Input ───────────────────────────────────────────────
  if (step === "input") {
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-65))", textTransform: "uppercase", letterSpacing: 1, margin: 0, marginBottom: 4 }}>Step 1 of 2 · Invoice details</h3>
          <p style={{ fontSize: 11, color: "hsl(var(--muted-50))", margin: 0 }}>Enter the invoice info, then we'll compute a per-shipment split based on each shipment's freight tons.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="Invoice total value">
            <input type="number" step="0.01" value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} placeholder="0.00" data-testid="mj-invoice-value" style={inputStyle} />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="mj-currency" style={inputStyle}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Invoice number">
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. F-2026-001" data-testid="mj-invoice-number" style={inputStyle} />
          </Field>
        </div>
        <div style={{ marginBottom: 20 }}>
          <Field label="Service / category (from Invoicing)">
            <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="mj-category" style={inputStyle}>
              {COST_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Live summary box */}
        <div style={{ background: "hsl(var(--surface-12))", border: "1px solid hsl(var(--surface-18))", borderRadius: 6, padding: "12px 16px", marginBottom: 18 }}>
          <Stat label="Master" value={masterNumber} mono />
          <Stat label="Shipments under master" value={String(rows.length)} />
          <Stat label="Total freight tons" value={totalFreightTons.toFixed(3)} />
          <Stat
            label="Multiplier (invoice ÷ freight tons)"
            value={inputsValid ? multiplier.toFixed(4) : "—"}
            highlight={inputsValid}
          />
        </div>

        {totalFreightTons <= 0 && (
          <Warning>
            None of the shipments under this master have freight tons. Add dimensions in the Shipments tab before continuing.
          </Warning>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            disabled={!inputsValid}
            onClick={() => setStep("review")}
            data-testid="mj-step-next"
            style={{
              padding: "10px 22px",
              background: inputsValid ? "var(--brand-teal)" : "hsl(var(--surface-15))",
              color: inputsValid ? "var(--on-brand-teal)" : "hsl(var(--muted-40))",
              border: "none", borderRadius: 4,
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
              cursor: inputsValid ? "pointer" : "not-allowed",
            }}
          >
            Calculate split →
          </button>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Review ──────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-65))", textTransform: "uppercase", letterSpacing: 1, margin: 0, marginBottom: 4 }}>Step 2 of 2 · Review the split</h3>
        <p style={{ fontSize: 11, color: "hsl(var(--muted-50))", margin: 0 }}>
          Invoice {invoiceNumber} · {invValueNum.toFixed(2)} {currency} · category <span style={{ color: "var(--brand-teal)" }}>{COST_CATEGORIES.find((c) => c.key === category)?.label}</span> · multiplier <span style={{ color: "var(--brand-teal)", fontWeight: 700 }}>{multiplier.toFixed(4)}</span>
        </p>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
        <thead>
          <tr style={{ background: "hsl(var(--surface-13))", borderBottom: "1px solid hsl(var(--surface-20))" }}>
            <Th>Internal Reference</Th>
            <Th align="right">Freight Tons</Th>
            <Th align="right">Multiplier</Th>
            <Th align="right">Amount ({currency})</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const amt = r.freightTon * multiplier;
            const isZero = r.freightTon <= 0;
            const isExisting = !!existing[r.jobNumber];
            const overwrite = overwriteRows.has(r.jobNumber);
            const rowBg = isZero ? "var(--tint-red-soft)" : isExisting && !overwrite ? "rgba(255, 235, 59, 0.06)" : "transparent";
            return (
              <tr key={r.jobNumber} style={{ borderBottom: "1px solid hsl(var(--surface-15))", background: rowBg }}>
                <td style={{ padding: "10px 12px", color: "var(--brand-teal)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.jobNumber}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: isZero ? "var(--brand-red-strong)" : "hsl(var(--fg-96))" }}>{r.freightTon.toFixed(3)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "hsl(var(--muted-55))" }}>{multiplier.toFixed(4)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: isZero ? "var(--brand-red-strong)" : "var(--brand-teal)", fontWeight: 700 }}>{isZero ? "—" : amt.toFixed(2)}</td>
                <td style={{ padding: "10px 12px", fontSize: 11 }}>
                  {isZero ? (
                    <span style={{ color: "var(--brand-red-strong)" }}>· no freight tons — add dimensions</span>
                  ) : isExisting ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: overwrite ? "var(--brand-teal)" : "var(--brand-amber)" }}>
                      <input type="checkbox" checked={overwrite} onChange={() => toggleOverwrite(r.jobNumber)} data-testid={`mj-overwrite-${r.jobNumber}`} style={{ accentColor: "var(--brand-teal)" }} />
                      {overwrite
                        ? `overwrite ${existing[r.jobNumber]?.realAmount} ${existing[r.jobNumber]?.realCurrency}`
                        : `existing ${existing[r.jobNumber]?.realAmount} ${existing[r.jobNumber]?.realCurrency} — keep`}
                    </label>
                  ) : (
                    <span style={{ color: "hsl(var(--muted-50))" }}>· will write</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "hsl(var(--surface-12))", borderTop: "2px solid hsl(var(--surface-20))" }}>
            <td style={{ padding: "10px 12px", color: "hsl(var(--muted-65))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Σ total</td>
            <td style={{ padding: "10px 12px", textAlign: "right", color: "hsl(var(--fg-96))", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totalFreightTons.toFixed(3)}</td>
            <td />
            <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--brand-teal)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{(totalFreightTons * multiplier).toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      {blockProceed && (
        <Warning intent="error">
          {zeroFreightShipments.length} shipment{zeroFreightShipments.length === 1 ? "" : "s"} ha{zeroFreightShipments.length === 1 ? "s" : "ve"} 0 freight tons. Add dimensions or remove from this master before proceeding.
        </Warning>
      )}
      {!blockProceed && conflicts.length > 0 && (
        <Warning intent="warn">
          {conflicts.length} shipment{conflicts.length === 1 ? "" : "s"} already ha{conflicts.length === 1 ? "s" : "ve"} a value for "{COST_CATEGORIES.find((c) => c.key === category)?.label}". Tick the overwrite checkbox above for any you want to replace; un-ticked rows will be skipped.
        </Warning>
      )}
      {submitError && <Warning intent="error">{submitError}</Warning>}
      {submitDone && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--tint-green)", border: "1px solid rgba(76,175,80,0.4)", borderRadius: 4, color: "var(--brand-green)", fontSize: 12, marginBottom: 14 }}>
          <Check className="w-4 h-4" />
          Pushed to Invoicing — closing…
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button
          onClick={() => setStep("input")}
          data-testid="mj-step-back"
          disabled={submitting}
          style={{ padding: "10px 18px", background: "transparent", border: "1px solid hsl(var(--surface-22))", borderRadius: 4, color: "hsl(var(--muted-65))", cursor: "pointer", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Correct
        </button>
        <button
          onClick={handleProceed}
          disabled={!canSubmit}
          data-testid="mj-proceed"
          style={{ padding: "10px 26px", background: canSubmit ? "var(--brand-teal)" : "hsl(var(--surface-15))", color: canSubmit ? "var(--on-brand-teal)" : "hsl(var(--muted-40))", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          {submitting ? "Uploading…" : "Proceed → push to Invoicing"}
        </button>
      </div>
    </div>
  );
}

// ─── Tiny presentational helpers ───────────────────────────────────
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right"; }) {
  return <th style={{ textAlign: align, padding: "10px 12px", color: "hsl(var(--muted-55))", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode; }) {
  return <td style={{ padding: "8px 12px", color: "hsl(var(--fg-96))", fontVariantNumeric: "tabular-nums" }}>{children}</td>;
}
function Field({ label, children }: { label: string; children: React.ReactNode; }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ color: "hsl(var(--muted-55))", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}
function Stat({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean; }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12 }}>
      <span style={{ color: "hsl(var(--muted-55))" }}>{label}</span>
      <span style={{ color: highlight ? "var(--brand-teal)" : "hsl(var(--fg-96))", fontFamily: mono ? "var(--font-mono)" : "inherit", fontWeight: highlight ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
function Warning({ children, intent = "warn" }: { children: React.ReactNode; intent?: "warn" | "error"; }) {
  const isErr = intent === "error";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", marginBottom: 14, background: isErr ? "var(--tint-red-soft)" : "var(--tint-orange-soft)", border: `1px solid ${isErr ? "var(--tint-red)" : "var(--tint-orange)"}`, borderRadius: 4, color: isErr ? "var(--brand-red-strong)" : "var(--brand-amber)", fontSize: 11, lineHeight: 1.5 }}>
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "hsl(var(--surface-9))",
  border: "1px solid hsl(var(--surface-18))",
  borderRadius: 4,
  color: "hsl(var(--fg-96))",
  fontSize: 12,
};
