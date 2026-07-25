import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import { ArrowLeft, Building2, ChevronRight, AlertTriangle } from "lucide-react";
import { Loader2 } from "lucide-react";

// ── Design tokens (same as CustomerCard) ─────────────────────────────────────
const T = {
  bg: "#F9FAFB", surface: "#FFFFFF",
  border: "#E5E7EB", borderL: "#F3F4F6",
  text: "#111827", textSub: "#374151", textMuted: "#6B7280", textLight: "#9CA3AF",
  blue: "#1D4ED8", green: "#15803D", red: "#B91C1C", amber: "#B45309",
};

// ── NACE map ──────────────────────────────────────────────────────────────────
const NACE_MAP: Record<string, { label: string; cargo: string; risk: "Low" | "Medium" | "High" }> = {
  "01": { label: "Agriculture", cargo: "Agricultural products", risk: "Low" },
  "10": { label: "Food manufacturing", cargo: "Food / Perishables", risk: "Low" },
  "20": { label: "Chemicals", cargo: "Chemicals / Hazmat", risk: "High" },
  "21": { label: "Pharmaceuticals", cargo: "Pharma / Temp-controlled", risk: "Medium" },
  "24": { label: "Basic metals", cargo: "Steel / Metals", risk: "Medium" },
  "25": { label: "Fabricated metal products", cargo: "Metal parts", risk: "Low" },
  "26": { label: "Electronics / ICT", cargo: "Electronics / Hi-tech", risk: "Medium" },
  "28": { label: "Machinery", cargo: "Industrial machinery", risk: "Low" },
  "29": { label: "Automotive", cargo: "Vehicles / Auto parts", risk: "Medium" },
  "46": { label: "Wholesale trade", cargo: "Mixed goods", risk: "Low" },
  "47": { label: "Retail trade", cargo: "Consumer goods", risk: "Low" },
  "49": { label: "Land transport", cargo: "Logistics services", risk: "Low" },
  "52": { label: "Warehousing / Logistics", cargo: "Logistics services", risk: "Low" },
  "62": { label: "IT / Software", cargo: "Electronics / Equipment", risk: "Low" },
  "64": { label: "Financial services", cargo: "Documents", risk: "Low" },
  "23": { label: "Non-metallic minerals", cargo: "Stone / Glass / Ceramics", risk: "Low" },
  "G":  { label: "Wholesale & Retail trade", cargo: "Mixed goods", risk: "Low" },
};
const LEGAL_FORM_MAP: Record<string, string> = {
  "121": "Akciová společnost (a.s.)", "122": "Akciová společnost (a.s.)",
  "112": "Společnost s r.o. / Sdružení firem", "211": "Státní podnik",
};

function legalFormText(code: string): string {
  if (!code) return "—";
  if (LEGAL_FORM_MAP[code]) return LEGAL_FORM_MAP[code];
  return code;
}
function parseNaceCodes(nace: string): string[] {
  if (!nace) return [];
  return nace.split(",").map(s => s.trim()).filter(Boolean);
}
function getNaceInfo(codes: string[]) {
  const results = codes.map(code => {
    const e = NACE_MAP[code] || NACE_MAP[code.slice(0, 2)] || NACE_MAP[code.slice(0, 1)];
    return e ? { ...e, code } : null;
  }).filter(Boolean) as ({ label: string; cargo: string; risk: "Low" | "Medium" | "High"; code: string })[];
  return { primary: results[0] ?? null, secondary: results.slice(1) };
}
function calcCompanyAge(regDate: string): { years: number; label: string } {
  if (!regDate) return { years: 0, label: "—" };
  const years = Math.floor((Date.now() - new Date(regDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  return { years, label: years <= 0 ? "< 1 year" : `${years} years` };
}
function calcRisk(status: string, regDate: string, naceInfo: ReturnType<typeof getNaceInfo>): { level: "Low" | "Medium" | "High"; reasons: string[] } {
  const reasons: string[] = [];
  let level: "Low" | "Medium" | "High" = "Low";
  const { years } = calcCompanyAge(regDate);
  if (status && !status.toLowerCase().includes("active")) { reasons.push("Registry status: " + status); level = "High"; }
  if (years < 2 && regDate) { reasons.push("New company (< 2 years)"); if (level === "Low") level = "Medium"; }
  if (naceInfo.primary?.risk === "High") { level = "High"; reasons.push("High-risk industry"); }
  else if (naceInfo.primary?.risk === "Medium" && level === "Low") level = "Medium";
  return { level, reasons };
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="info-row">
      <div className="info-label">{label}</div>
      <div className={`info-value${mono ? " mono" : ""}`}>{value}</div>
    </div>
  );
}

export default function CustomerProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const customerId = parseInt(id ?? "0");

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    queryFn: () => apiRequest("GET", `/api/customers/${customerId}`).then(r => r.json()),
    enabled: !!customerId,
  });

  if (isLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 style={{ width: 22, height: 22, color: T.blue, animation: "spin 1s linear infinite" }} />
    </div>
  );
  if (!customer) return <div style={{ padding: 40 }}>Customer not found</div>;

  const naceCodes = parseNaceCodes(customer.nace ?? "");
  const naceInfo = getNaceInfo(naceCodes);
  const age = calcCompanyAge(customer.registrationDate ?? "");
  const risk = calcRisk(customer.companyStatus ?? "", customer.registrationDate ?? "", naceInfo);
  const isActive = !customer.companyStatus || customer.companyStatus.toLowerCase().includes("active");
  const isNewCo = age.years < 2 && !!customer.registrationDate;
  const isDataStale = customer.lastRegistryUpdate
    ? (Date.now() - new Date(customer.lastRegistryUpdate).getTime()) / (1000 * 60 * 60 * 24) > 90
    : false;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "var(--font-system)" }}>

      {/* Nav */}
      <nav style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, height: 50, display: "flex", alignItems: "center", padding: "0 24px", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: T.blue, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 style={{ width: 14, height: 14, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>CRM</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: T.textMuted }}>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 13 }}>Customers</button>
          <ChevronRight style={{ width: 12, height: 12 }} />
          <button onClick={() => setLocation(`/customers/${customerId}`)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textMuted, fontSize: 13 }}>{customer.companyName}</button>
          <ChevronRight style={{ width: 12, height: 12 }} />
          <span style={{ color: T.text, fontWeight: 600 }}>Company Profile</span>
        </div>
      </nav>

      {/* Page header */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${T.border}`, padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setLocation(`/customers/${customerId}`)}
          style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 5, padding: "5px 8px", cursor: "pointer", color: T.textMuted, display: "flex", alignItems: "center" }}>
          <ArrowLeft style={{ width: 14, height: 14 }} />
        </button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", margin: "0 0 2px" }}>Company Profile — {customer.companyName}</h1>
          <p style={{ fontSize: 12, color: T.textLight, margin: 0 }}>Detailed company analysis and registry data</p>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Validation banners */}
        {((!isActive && customer.companyStatus) || isNewCo || isDataStale || risk.level !== "Low") && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {!isActive && customer.companyStatus && (
              <div className="warn-banner" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C" }}>
                <AlertTriangle style={{ width: 13, height: 13 }} /> Registry status: {customer.companyStatus} — company may not be active
              </div>
            )}
            {isNewCo && (
              <div className="warn-banner" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#B45309" }}>
                <AlertTriangle style={{ width: 13, height: 13 }} /> New company — registered less than 2 years ago
              </div>
            )}
            {isDataStale && (
              <div className="warn-banner" style={{ background: "#F9FAFB", border: `1px solid ${T.border}`, color: T.textMuted }}>
                <AlertTriangle style={{ width: 13, height: 13 }} /> Registry data may be outdated (last update &gt; 90 days)
              </div>
            )}
            {risk.level !== "Low" && (
              <div className="warn-banner" style={{ background: risk.level === "High" ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${risk.level === "High" ? "#FECACA" : "#FDE68A"}`, color: risk.level === "High" ? "#B91C1C" : "#B45309" }}>
                <AlertTriangle style={{ width: 13, height: 13 }} /> {risk.level} risk: {risk.reasons.join(" · ")}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Company Analysis */}
          <div className="panel">
            <div className="section-head">Company Analysis</div>
            <div style={{ padding: "4px 14px 12px" }}>
              <Row label="Primary industry" value={naceInfo.primary?.label ?? "—"} />
              <Row label="Typical cargo" value={
                naceInfo.primary
                  ? <span style={{ background: "#EFF6FF", color: T.blue, padding: "1px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{naceInfo.primary.cargo}</span>
                  : "—"
              } />
              <Row label="Company age" value={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {age.years > 0 ? `${customer.registrationDate} (${age.label})` : "—"}
                  {isNewCo && <span style={{ fontSize: 10, fontWeight: 700, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "1px 6px", borderRadius: 4 }}>NEW</span>}
                </span>
              } />
              <Row label="Stability" value={
                age.years >= 10 ? "Established (10+ yrs)" :
                age.years >= 5  ? "Stable (5–10 yrs)" :
                age.years >= 2  ? "Growing (2–5 yrs)" :
                customer.registrationDate ? "New (< 2 yrs)" : "—"
              } />
              <Row label="Risk level" value={
                <span style={{ fontWeight: 700, color: risk.level === "High" ? T.red : risk.level === "Medium" ? T.amber : T.green }}>
                  {risk.level}
                  {risk.reasons.length > 0 && <span style={{ fontWeight: 400, fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{risk.reasons.join(", ")}</span>}
                </span>
              } />
              {naceInfo.secondary.length > 0 && (
                <Row label="Secondary activities" value={
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {[...new Set(naceInfo.secondary.slice(0, 5).map(s => s.label))].map(l => (
                      <span key={l} style={{ fontSize: 11, background: "#F3F4F6", color: T.textMuted, padding: "1px 6px", borderRadius: 3 }}>{l}</span>
                    ))}
                  </div>
                } />
              )}
            </div>
          </div>

          {/* Registry Data (ARES) */}
          <div className="panel-secondary" style={{ border: "1px dashed #E5E7EB" }}>
            <div className="section-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Registry Data (ARES)</span>
              <span style={{ fontSize: 10, color: T.textLight, background: "#F3F4F6", padding: "1px 6px", borderRadius: 3, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>Raw</span>
            </div>
            <div style={{ padding: "4px 14px 12px" }}>
              {[
                ["Legal form code",    customer.legalForm || "—",        false, true],
                ["Legal form text",    legalFormText(customer.legalForm ?? ""), false, false],
                ["Registry status",   customer.companyStatus || "—",     false, false],
                ["Registered address",customer.registeredAddress || "—", false, false],
                ["City",              customer.city || "—",               false, false],
                ["Country",           customer.country || "—",           false, false],
                ["Registration date", customer.registrationDate || "—",  false, false],
                ["NACE codes",        customer.nace ? customer.nace.split(",").slice(0, 8).join(", ") + (customer.nace.split(",").length > 8 ? "…" : "") : "—", false, true],
                ["Data source",       customer.dataSource || "ARES",     false, false],
                ["Last update",       customer.lastRegistryUpdate || "—",false, false],
              ].map(([k, v, , mono]) => (
                <div key={k as string} style={{ display: "flex", padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ width: 155, flexShrink: 0, fontSize: 12, fontWeight: 500, color: T.textMuted }}>{k as string}</div>
                  <div style={{ fontSize: 12, color: T.textSub, fontFamily: mono ? "monospace" : undefined }}>{v as string}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
