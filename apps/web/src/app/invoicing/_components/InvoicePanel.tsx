"use client";

import { useMemo } from "react";
import { Button, Select, Tag, Tooltip } from "antd";
import { PrinterOutlined, WarningOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useInvoicing } from "@/hooks/useInvoicing";
import { useToast } from "@/lib/toast";
import { money } from "@/lib/money";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";
import { resolveBilledParty } from "../_lib/billing";
import { buildInvoiceDraft } from "../_lib/invoiceLines";
import { generateInvoicePDF } from "../_lib/invoicePdf";

/** Billing currencies we have exchange rates for (Exchange page: EUR, USD; CZK is the base). */
const BILLING_CURRENCIES = ["CZK", "EUR", "USD"];

const TH = "text-[11.5px] font-bold tracking-[.04em] uppercase text-slate-500 px-2 py-2 border-b border-slate-200";
const TD = "px-2 py-2 border-b border-slate-100 text-[13px] text-slate-700";

/**
 * The invoice for one shipment: the selling rows ticked for Invoice, converted into the
 * billing currency, with cost, profit and margin. Uses the same data as the Costs section
 * above it, so both always show the same numbers.
 */
export function InvoicePanel({ shipment }: { shipment: ShipmentItem }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, billingCur, sellRows, totals } = useCostsData(shipment);
  const { generateInvoice, isGenerating } = useInvoicing(shipment.id);

  const draft = useMemo(() => buildInvoiceDraft(sellRows, totals), [sellRows, totals]);
  const billedParty = resolveBilledParty(shipment);
  const generated = data?.generatedInvoices ?? [];

  const missingRates = totals.missingCurrencies;
  const blocked =
    draft.lines.length === 0 ? "Tick at least one selling row for Invoice in the Costs section above."
    : draft.total <= 0 ? "The invoice total must be above zero."
    : missingRates.length > 0 ? `No exchange rate for ${missingRates.join(", ")} — add it on the Exchange page first.`
    : "";

  const setBillingCurrency = async (currency: string) => {
    try {
      await api.invoicing.invoicingUpsertBillingSettings(shipment.id, { billingCurrency: currency });
      await queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });
    } catch {
      toast.error("Failed to change the billing currency");
    }
  };

  const handleGenerate = async (invoiceType: "breakdown" | "total") => {
    if (blocked) return;
    try {
      const res = await generateInvoice({
        invoiceType,
        billingCurrency: billingCur,
        totalAmount: draft.total.toFixed(2),
      });
      generateInvoicePDF({
        invoiceNumber: res.invoice.invoiceNumber,
        jobNumber: shipment.jobNumber,
        billedPartyName: billedParty,
        billingCurrency: billingCur,
        invoiceType,
        lineItems: draft.lines.map((l) => ({ label: l.label, amount: l.total })),
        totalAmount: draft.total,
      });
      toast.success(`Invoice ${res.invoice.invoiceNumber} generated`);
    } catch {
      toast.error("Failed to generate invoice");
    }
  };

  const profitTone = draft.profit > 0 ? "text-[#177245]" : draft.profit < 0 ? "text-[#C3392B]" : "text-slate-700";

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="h-[38px] px-4 flex items-center gap-3 text-[12.5px] font-bold uppercase tracking-[.05em] bg-indigo-50 text-indigo-700">
        <span>Invoice</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal font-medium text-[12.5px] text-slate-600">
          Billing currency
          <Select
            size="small"
            value={billingCur}
            onChange={setBillingCurrency}
            options={BILLING_CURRENCIES.map((c) => ({ value: c, label: c }))}
            className="w-[84px]"
            aria-label="Billing currency"
          />
        </span>
      </div>

      <div className="p-4">
        <div className="text-[13px] text-slate-600 mb-3">
          Bill to: <span className="font-semibold text-slate-900">{billedParty || "—"}</span>
        </div>

        {draft.lines.length === 0 ? (
          <p className="text-[13px] text-slate-500 m-0 mb-4">
            Nothing to invoice yet. Add selling costs in the Costs section above and tick them for Invoice.
          </p>
        ) : (
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Service</th>
                <th className={`${TH} text-right w-[10%]`}>Qty</th>
                <th className={`${TH} text-right w-[18%]`}>Price</th>
                <th className={`${TH} text-right w-[20%]`}>Total in {billingCur}</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l) => (
                <tr key={l.id}>
                  <td className={TD}>{l.label}</td>
                  <td className={`${TD} text-right tabular-nums`}>{l.qty}</td>
                  <td className={`${TD} text-right tabular-nums`}>{l.amount} {l.currency}</td>
                  <td className={`${TD} text-right tabular-nums font-medium`}>{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {draft.unconvertible.length > 0 && (
          <div className="flex items-start gap-2 text-[13px] text-[#9A5B00] bg-[#FFF6E5] border border-[#F5D9A8] rounded-md px-3 py-2 mb-4">
            <WarningOutlined className="mt-[3px]" />
            <span>
              {draft.unconvertible.length} ticked row{draft.unconvertible.length !== 1 ? "s are" : " is"} left out — no
              exchange rate for {missingRates.join(", ")}.
            </span>
          </div>
        )}

        <div className="flex items-end justify-between gap-6 flex-wrap border-t border-slate-200 pt-4">
          <div className="flex gap-6 text-[13px]">
            <div>
              <div className="text-slate-500">Cost</div>
              <div className="font-semibold text-slate-900 tabular-nums">{money(draft.cost)} {billingCur}</div>
            </div>
            <div>
              <div className="text-slate-500">Profit</div>
              <div className={`font-semibold tabular-nums ${profitTone}`}>{money(draft.profit)} {billingCur}</div>
            </div>
            <div>
              <div className="text-slate-500">Margin</div>
              <div className={`font-semibold tabular-nums ${profitTone}`}>
                {draft.marginPct === null ? "—" : `${draft.marginPct.toFixed(1)} %`}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-bold uppercase tracking-[.05em] text-slate-500">Invoice total</div>
            <div className="text-[24px] font-bold text-slate-900 tabular-nums leading-tight">
              {money(draft.total)} <span className="text-[15px] font-semibold text-slate-500">{billingCur}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Tooltip title={blocked}>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              loading={isGenerating}
              disabled={!!blocked}
              onClick={() => handleGenerate("breakdown")}
            >
              Breakdown PDF
            </Button>
          </Tooltip>
          <Tooltip title={blocked}>
            <Button icon={<PrinterOutlined />} disabled={!!blocked || isGenerating} onClick={() => handleGenerate("total")}>
              Total Only PDF
            </Button>
          </Tooltip>
          {blocked && <span className="text-[12.5px] text-slate-500">{blocked}</span>}
        </div>

        {generated.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-3">
            <div className="text-[11.5px] font-bold uppercase tracking-[.04em] text-slate-500 mb-2">Generated invoices</div>
            <table className="w-full border-collapse">
              <tbody>
                {generated.map((inv) => (
                  <tr key={inv.id}>
                    <td className={`${TD} font-mono font-medium`}>{inv.invoiceNumber}</td>
                    <td className={TD}><Tag bordered={false}>{inv.invoiceType}</Tag></td>
                    <td className={`${TD} text-right tabular-nums`}>{money(Number(inv.totalAmount))} {inv.billingCurrency}</td>
                    <td className={`${TD} text-right text-slate-500`}>{new Date(inv.createdAt).toLocaleString("cs-CZ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
