"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeftOutlined, WarningFilled, InfoCircleFilled } from "@ant-design/icons";
import { useCustomer } from "@/hooks/useCustomers";
import {
  parseNaceCodes,
  getNaceInfo,
  calcCompanyAge,
  calcRisk,
  calcStability,
  legalFormText,
  isDataStale,
  RISK_COLOR,
} from "../../_lib/companyAnalysis";

export function ProfileContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { customer } = useCustomer(id);

  if (!customer) return null;

  const naceInfo = getNaceInfo(parseNaceCodes(customer.nace));
  const age = calcCompanyAge(customer.registrationDate);
  const risk = calcRisk(customer.companyStatus, customer.registrationDate, naceInfo);
  const riskColor = RISK_COLOR[risk.level];
  const stale = isDataStale(customer.lastRegistryUpdate);
  const inactive = !!customer.companyStatus && !customer.companyStatus.toLowerCase().includes("active");

  const banners: { tone: "red" | "amber" | "blue"; text: string }[] = [];
  if (inactive) banners.push({ tone: "red", text: `Registry status is "${customer.companyStatus}" — verify the company is still trading before quoting.` });
  if (age.years < 2 && age.years >= 0 && customer.registrationDate) banners.push({ tone: "amber", text: "New company (less than 2 years old) — consider prepayment terms." });
  if (stale) banners.push({ tone: "amber", text: "ARES registry data is more than 90 days old — refresh from the registry." });
  if (risk.level !== "Low") banners.push({ tone: risk.level === "High" ? "red" : "amber", text: `Risk level ${risk.level}: ${risk.reasons.join("; ") || "review before extending credit"}.` });

  const bannerClass = (tone: string) =>
    tone === "red"
      ? "bg-red-50 border-red-200 text-red-700"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-blue-50 border-blue-200 text-blue-700";

  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1100px] mx-auto">
        <button onClick={() => router.push(`/customers/${id}`)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeftOutlined className="text-xs" /> {customer.companyName}
        </button>
        <h1 className="text-xl font-bold text-slate-800 mb-4">Company Profile</h1>

        {/* Validation banners */}
        {banners.length > 0 && (
          <div className="space-y-2 mb-5">
            {banners.map((b, i) => (
              <div key={i} className={`flex items-start gap-2 border rounded-xl px-3 py-2 text-[13px] ${bannerClass(b.tone)}`}>
                {b.tone === "red" ? <WarningFilled className="mt-0.5" /> : <InfoCircleFilled className="mt-0.5" />}
                <span>{b.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 items-start">
          {/* Company analysis */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-sm font-semibold text-slate-800 mb-3">Company analysis</div>
            <div className="space-y-2.5 text-[13px]">
              <Row label="Primary industry" value={naceInfo.primary?.label ?? "—"} />
              <Row
                label="Typical cargo"
                value={
                  naceInfo.primary ? (
                    <span className="rounded-md text-[11px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700">{naceInfo.primary.cargo}</span>
                  ) : (
                    "—"
                  )
                }
              />
              <Row
                label="Company age"
                value={
                  <span>
                    {age.label}
                    {age.years < 2 && age.years >= 0 && customer.registrationDate && (
                      <span className="rounded-md text-[11px] font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 ml-1.5">NEW</span>
                    )}
                  </span>
                }
              />
              <Row label="Stability" value={calcStability(age.years)} />
              <Row
                label="Risk level"
                value={
                  <span className="rounded-md text-[11px] font-semibold px-2 py-0.5" style={{ backgroundColor: riskColor.bg, color: riskColor.text }}>
                    {risk.level}
                  </span>
                }
              />
              {risk.reasons.length > 0 && (
                <div>
                  <div className="text-slate-400 mb-1">Risk factors</div>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    {risk.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {naceInfo.secondary.length > 0 && (
                <div>
                  <div className="text-slate-400 mb-1">Secondary activities</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(naceInfo.secondary.slice(0, 6).map((s) => s.label))].map((l) => (
                      <span key={l} className="rounded-md text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Raw registry */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-800">Registry data (ARES)</span>
              <span className="rounded-md text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-500 uppercase">Raw</span>
            </div>
            <div className="space-y-2 text-[13px]">
              <Row label="IČO" value={customer.ico} />
              <Row label="DIČ" value={customer.dic || "—"} />
              <Row label="Legal form code" value={customer.legalForm || "—"} />
              <Row label="Legal form" value={legalFormText(customer.legalForm)} />
              <Row label="Registry status" value={customer.companyStatus || "—"} />
              <Row label="Registered address" value={customer.registeredAddress || "—"} />
              <Row label="City" value={customer.city || "—"} />
              <Row label="Country" value={customer.country || "—"} />
              <Row label="Registration date" value={customer.registrationDate || "—"} />
              <Row
                label="NACE codes"
                value={
                  customer.nace
                    ? customer.nace.split(",").slice(0, 8).join(", ") + (customer.nace.split(",").length > 8 ? "…" : "")
                    : "—"
                }
              />
              <Row label="Data source" value={customer.dataSource || "—"} />
              <Row label="Last update" value={<span className={stale ? "text-amber-600" : "text-slate-700"}>{customer.lastRegistryUpdate || "—"}</span>} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}
