"use client";

import { Drawer, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const QUOTE_DISPLAY_FIELDS = [
  "Shipper", "Consignee", "Load Type", "Agent", "Agent's PIC",
  "Incoterm Origin", "Incoterm Destination", "Cargo Origin", "Origin",
  "POL", "POD", "Destination", "HS Code", "Cargo Description",
  "Trade Direction", "Volume", "Weight", "Number of pieces",
];

const COST_CATEGORY_LABELS: Record<string, string> = {
  freight: "Freight",
  collection: "Collection/Delivery",
  locals: "Locals",
  others: "Others",
  insurance: "Insurance",
  customs: "Customs",
};

const parseNum = (v: string | null | undefined) => {
  const n = parseFloat(v || "");
  return isNaN(n) ? 0 : n;
};
const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function quoteFields(data: unknown): Array<[string, string]> {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const whitelisted = QUOTE_DISPLAY_FIELDS
    .map((f) => [f, obj[f]] as const)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([f, v]) => [f, String(v)] as [string, string]);
  if (whitelisted.length > 0) return whitelisted;
  // Fallback: show first non-empty string entries
  return Object.entries(obj)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .slice(0, 15)
    .map(([k, v]) => [k, String(v)]);
}

export function LinkedQuotePanel({
  quoteNumber,
  open,
  onClose,
}: {
  quoteNumber: string;
  open: boolean;
  onClose: () => void;
}) {
  const quoteQuery = useQuery({
    queryKey: ["quote", quoteNumber],
    queryFn: () => api.quotes.quoteGet(quoteNumber),
    enabled: open && !!quoteNumber,
  });

  const invoicingQuery = useQuery({
    queryKey: ["invoicing", quoteNumber],
    queryFn: () => api.invoicing.invoicingGet(quoteNumber),
    enabled: open && !!quoteNumber,
  });

  const loading = quoteQuery.isLoading || invoicingQuery.isLoading;
  const quote = quoteQuery.data?.quote;
  const fields = quoteFields(quote?.data);

  const inv = invoicingQuery.data;
  const costs = inv?.costs ?? [];
  const charges = inv?.additionalCharges ?? [];
  const billingCurrency = inv?.billingSettings?.billingCurrency || "CZK";
  const overrideMap: Record<string, string> = {};
  for (const ov of inv?.billingOverrides ?? []) {
    if (ov.billingAmount) overrideMap[ov.rowKey] = ov.billingAmount;
  }

  const supplierTotal =
    costs.reduce((s, c) => s + parseNum(c.realAmount), 0) +
    charges.reduce((s, c) => s + parseNum(c.realAmount), 0);
  const billingTotal =
    costs.reduce((s, c) => s + parseNum(overrideMap[c.category] || c.realAmount), 0) +
    charges.reduce((s, c) => s + parseNum(c.realAmount), 0);
  const profit = billingTotal - supplierTotal;

  const hasCostData = costs.length > 0 || charges.length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={420}
      title={
        <div>
          <div className="text-sm font-semibold text-slate-700">Linked Quote</div>
          <div className="text-[11px] font-mono text-slate-400">{quoteNumber}</div>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-32"><Spin /></div>
      ) : !quote ? (
        <div className="flex items-center justify-center h-32 text-xs text-slate-400">Quote not found</div>
      ) : (
        <div className="space-y-5">
          {/* Quote fields */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Quote Details</h4>
            <div className="space-y-1.5">
              {fields.length === 0 && <div className="text-xs text-slate-400">No quote details available.</div>}
              {fields.map(([field, val]) => (
                <div key={field} className="flex items-start gap-2">
                  <span className="text-[11px] text-slate-400 shrink-0 w-[120px]">{field}</span>
                  <span className="text-xs text-slate-700">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cost breakdown */}
          {hasCostData && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Cost Breakdown</h4>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-3 gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-slate-400 border-b border-slate-200 bg-slate-50">
                  <span>Category</span>
                  <span className="text-right">Suppliers</span>
                  <span className="text-right">Billing</span>
                </div>
                {costs.map((c) => {
                  const billingAmt = overrideMap[c.category] || c.realAmount;
                  if (!c.realAmount && !billingAmt) return null;
                  return (
                    <div key={c.category} className="grid grid-cols-3 gap-1 px-3 py-1.5 text-xs border-b border-slate-100">
                      <span className="text-slate-600">{COST_CATEGORY_LABELS[c.category] || c.category}</span>
                      <span className="text-right tabular-nums text-slate-700">
                        {c.realAmount ? `${fmtNum(parseNum(c.realAmount))} ${c.realCurrency}` : "—"}
                      </span>
                      <span className="text-right tabular-nums text-slate-700">
                        {billingAmt ? `${fmtNum(parseNum(billingAmt))} ${billingCurrency}` : "—"}
                      </span>
                    </div>
                  );
                })}
                {charges.map((ac) => (
                  <div key={ac.id} className="grid grid-cols-3 gap-1 px-3 py-1.5 text-xs border-b border-slate-100">
                    <span className="text-slate-600">{ac.description || "Additional"}</span>
                    <span className="text-right tabular-nums text-slate-700">
                      {ac.realAmount ? `${fmtNum(parseNum(ac.realAmount))} ${ac.realCurrency}` : "—"}
                    </span>
                    <span className="text-right tabular-nums text-slate-400">—</span>
                  </div>
                ))}
                <div className="grid grid-cols-3 gap-1 px-3 py-2 text-xs font-semibold bg-slate-50">
                  <span className="text-slate-700">Total</span>
                  <span className="text-right tabular-nums text-slate-700">{fmtNum(supplierTotal)} {billingCurrency}</span>
                  <span className="text-right tabular-nums text-slate-700">{fmtNum(billingTotal)} {billingCurrency}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 px-3 py-2 text-xs font-semibold bg-slate-100">
                  <span className="text-slate-700">Profit</span>
                  <span />
                  <span className={`text-right tabular-nums font-bold ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {profit >= 0 ? "+" : ""}{fmtNum(profit)} {billingCurrency}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
