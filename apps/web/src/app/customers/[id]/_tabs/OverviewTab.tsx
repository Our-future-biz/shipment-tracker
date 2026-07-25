"use client";

import { useCustomer } from "@/hooks/useCustomers";
import { fmtMoney, marginPct } from "../../_lib/constants";
import { parseNaceCodes, getNaceInfo, calcCompanyAge, calcRisk, RISK_COLOR } from "../../_lib/companyAnalysis";

export function OverviewTab({ customerId }: { customerId: string }) {
  const { customer } = useCustomer(customerId);
  if (!customer) return null;

  const naceInfo = getNaceInfo(parseNaceCodes(customer.nace));
  const age = calcCompanyAge(customer.registrationDate);
  const risk = calcRisk(customer.companyStatus, customer.registrationDate, naceInfo);
  const riskColor = RISK_COLOR[risk.level];
  const margin = marginPct(customer.totalRevenue, customer.totalProfit);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Company analysis */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="text-sm font-semibold text-slate-800 mb-3">Company analysis</div>
        <div className="space-y-2.5 text-[13px]">
          <Row label="Primary industry" value={naceInfo.primary?.label ?? "—"} />
          <Row
            label="Likely cargo"
            value={
              naceInfo.primary ? (
                <span className="rounded-md text-[11px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700">
                  {naceInfo.primary.cargo}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Row label="Company age" value={age.label} />
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
              <div className="text-slate-400 mb-1">Secondary industries</div>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set(naceInfo.secondary.slice(0, 6).map((s) => s.label))].map((l) => (
                  <span key={l} className="rounded-md text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Row label="NACE codes" value={customer.nace ? customer.nace.split(",").slice(0, 8).join(", ") : "—"} />
        </div>
      </div>

      {/* Commercial snapshot */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="text-sm font-semibold text-slate-800 mb-3">Commercial snapshot</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Stat label="Total revenue" value={fmtMoney(customer.totalRevenue)} />
          <Stat label="Total profit" value={fmtMoney(customer.totalProfit)} />
          <Stat label="Margin" value={`${margin}%`} />
          <Stat label="Shipments" value={String(customer.totalShipments)} />
        </div>
        <div className="space-y-2.5 text-[13px]">
          <Row label="Status" value={customer.status} />
          <Row label="Account type" value={customer.label} />
          <Row label="Sales owner" value={customer.salesOwner || "—"} />
          <Row label="Credit limit" value={fmtMoney(customer.creditLimit)} />
          <Row label="Payment terms" value={customer.paymentTerms || "—"} />
          <Row label="Last activity" value={customer.lastActivityDate || "—"} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-base font-bold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}
