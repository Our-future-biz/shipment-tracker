"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Alert, Button, DatePicker, Input, Modal, Select, Tag, Tooltip, type RefSelectProps } from "antd";
import {
  DownOutlined,
  EditOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  RollbackOutlined,
  SendOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentMutations } from "@/hooks/useShipments";
import { useCustomers } from "@/hooks/useCustomers";
import { downloadInvoicePdf, useInvoiceDocs, type InvoiceDoc } from "@/hooks/useInvoiceDocs";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/date";
import { CURRENCIES } from "@/lib/enums";
import { invoicingKey } from "@/hooks/useInvoicing";
import { moneyCz } from "@/lib/money";
import { statusLabel } from "@/lib/shipmentStatus";
import { SectionCard } from "@/components/SectionCard";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";

/** Billing currencies offered: the ones the company invoices in, out of the app's currencies. */
const BILLING_CURRENCIES = CURRENCIES.filter((c) => c === "CZK" || c === "EUR" || c === "USD");

/** What each VAT code means on the invoice; NP is set automatically for a non-VAT-payer. */
const VAT_LABEL: Record<interfaces.VatCode, string> = {
  Z69: "0 % §69",
  S21: "21 %",
  RC: "Reverse charge",
  OUT: "Outside VAT",
  NP: "Not VAT payer",
};
/** VAT codes a line can be switched to. */
const VAT_OPTIONS = (["Z69", "S21", "RC", "OUT"] as const satisfies readonly interfaces.SellingVatCode[]).map((value) => ({
  value,
  label: VAT_LABEL[value],
}));

/** Operations release a job for billing by setting its Shipment Status to Billing (either direction). */
const isBillingStatus = (status: string | null | undefined) => /^Billing \[(IMP|EXP|DOM)\]$/.test((status ?? "").trim());

/** §28 ZDPH: a tax document must be issued within 15 days of the DUZP. */
const MAX_DAYS_AFTER_DUZP = 15;

const TH = "text-[11.5px] font-bold tracking-[.04em] uppercase text-slate-500 px-2 py-2 border-b border-slate-200";
const TD = "px-2 py-2 border-b border-slate-100 text-[13px] text-slate-700";
const czDate = (iso: string) => formatDate(iso) || "—";
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

interface FactProps {
  label: string;
  /** Grey 12px line(s) under the value. */
  sub?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** One fact of the strip at the top of the invoice, styled like the job card above it. */
const Fact = ({ label, sub, className = "", children }: FactProps) => (
  <div className={`min-w-0 ${className}`}>
    <div className="text-[11px] font-bold uppercase tracking-[.04em] text-slate-500 whitespace-nowrap">{label}</div>
    <div className="mt-1 min-h-7 text-[13px] text-slate-900 flex items-center flex-wrap gap-x-2 gap-y-1 break-words">{children}</div>
    {sub && <div className="text-[12px] text-slate-500 leading-[18px]">{sub}</div>}
  </div>
);

/** The part of the panel shown: the Invoice tab or the Invoices & credit notes tab. */
export type InvoicePanelSection = "invoice" | "documents";

/**
 * The invoice for one shipment. Everything shown is the server's preview (the same
 * calculation that issuing uses): selling rows ticked for Invoice, VAT code per line,
 * ČNB rate valid on the DUZP, the customer and the issuer details. Issuing creates an
 * immutable tax document with a stored PDF; corrections go through a credit note.
 */
interface InvoicePanelProps {
  shipment: ShipmentItem;
  // null while another tab is open: nothing is shown, but what was picked here stays
  section: InvoicePanelSection | null;
  /** Told the DUZP the next invoice would get (the default, or the one picked here), for the job card. */
  onDuzpChange?: (iso: string) => void;
  /** Opens the Costs Breakdown tab (from the empty Invoice tab). */
  onOpenCosts?: () => void;
}

export function InvoicePanel({ shipment, section, onDuzpChange, onOpenCosts }: InvoicePanelProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, billingCur } = useCostsData(shipment);
  const { updateShipment } = useShipmentMutations();
  const { customers } = useCustomers();

  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [duzp, setDuzp] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [creditTarget, setCreditTarget] = useState<{ doc: InvoiceDoc; key: string } | null>(null);
  const [creditReason, setCreditReason] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  // display only: the customer picker behind the pencil, and the VAT breakdown table
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [vatOpen, setVatOpen] = useState(false);
  const pencilRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const pickerRef = useRef<RefSelectProps>(null);
  const refocusPencil = useRef(false);

  // the preview is recomputed whenever the rows it is built from change
  const previewKey = useMemo(() => JSON.stringify([billingCur, data?.sellingCosts ?? []]), [billingCur, data?.sellingCosts]);
  const { preview, previewLoading, previewError, docs, issue, isIssuing, credit, isCrediting } = useInvoiceDocs(shipment.id, {
    customerId,
    duzp,
    previewKey,
  });

  const refreshCosts = () => queryClient.invalidateQueries({ queryKey: invoicingKey(shipment.id) });

  // Mutations, so a second change can't start while one is still saving.
  const billingCurrency = useMutation({
    mutationFn: (currency: string) => api.invoicing.invoicingUpsertBillingSettings(shipment.id, { billingCurrency: currency }),
    onSuccess: refreshCosts,
    onError: () => toast.error("Failed to change the billing currency"),
  });

  const lineVat = useMutation({
    mutationFn: ({ sellingId, vatCode }: { sellingId: string; vatCode: interfaces.SellingVatCode }) =>
      api.invoicing.invoicingUpdateSellingCost(shipment.id, sellingId, { vatCode }),
    onSuccess: refreshCosts,
    onError: () => toast.error("Failed to change the VAT code"),
  });

  const linkCustomer = useMutation({
    mutationFn: (id: string) => {
      const c = customers.find((x) => x.id === id);
      return updateShipment({ id: shipment.id, data: { customer: c?.companyName ?? "", customerId: id } }).then(() => c);
    },
    onSuccess: (c) => toast.success(`${c?.companyName ?? "Customer"} linked to ${shipment.jobNumber}`),
    onError: () => toast.error("The customer is used for this invoice, but linking it to the shipment failed"),
  });

  const handleLineVat = (sellingId: string | null, vatCode: interfaces.SellingVatCode) => {
    if (sellingId) lineVat.mutate({ sellingId, vatCode });
  };

  /** Picking a customer for a shipment that has none also links it, as on the shipment page. */
  const handlePickCustomer = (id: string) => {
    setCustomerId(id);
    if (!shipment.customerId) linkCustomer.mutate(id);
  };

  const download = async (doc: Pick<InvoiceDoc, "id" | "number">) => {
    setDownloading(doc.id);
    try {
      await downloadInvoicePdf(doc.id);
    } catch {
      toast.error(`Could not download the PDF of ${doc.number}`);
    } finally {
      setDownloading(null);
    }
  };

  const confirmIssue = async () => {
    if (!confirmKey) return;
    try {
      const { invoice } = await issue({ customerId, duzp, note: note.trim() || undefined, idempotencyKey: confirmKey });
      setConfirmKey(null);
      setNote("");
      toast.success(`Invoice ${invoice.number} issued`);
      await download(invoice);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to issue the invoice");
    }
  };

  const confirmCredit = async () => {
    if (!creditTarget || !creditReason.trim()) return;
    try {
      const { invoice } = await credit({ invoiceId: creditTarget.doc.id, reason: creditReason.trim(), idempotencyKey: creditTarget.key });
      setCreditTarget(null);
      setCreditReason("");
      toast.success(`Credit note ${invoice.number} issued`);
      await download(invoice);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to issue the credit note");
    }
  };

  const p = preview;
  const nextDuzp = duzp ?? p?.duzp;
  useEffect(() => {
    if (nextDuzp) onDuzpChange?.(nextDuzp);
  }, [nextDuzp, onDuzpChange]);
  const foreign = !!p && p.currency !== "CZK";

  // Issuing is allowed before the job reaches Billing (owner's decision), but it is flagged.
  const releasedForBilling = isBillingStatus(shipment.status);
  const notReleasedWarning = releasedForBilling
    ? ""
    : shipment.status
      ? `Shipment Status is "${statusLabel(shipment.status)}", not Billing — operations has not released this job for billing yet.`
      : "The job has no Shipment Status — it is not released for billing (Billing) yet.";

  const warnings: string[] = [];
  if (notReleasedWarning) warnings.push(notReleasedWarning);
  if (p) {
    const late = dayjs(p.issueDate).diff(dayjs(p.duzp), "day");
    if (late > MAX_DAYS_AFTER_DUZP) warnings.push(`DUZP is ${late} days before today — a tax document must be issued within ${MAX_DAYS_AFTER_DUZP} days of the DUZP (§28 ZDPH).`);
    if (p.roePct !== 100 && p.lines.some((l) => l.unitCurrency !== p.currency)) {
      warnings.push(`Lines in another currency are converted at the ČNB rate × ROE ${p.roePct} % (Exchange page). The CZK tax amounts use the pure ČNB rate.`);
    }
  }
  const problems = p?.problems ?? [];
  const canIssue = !!p && problems.length === 0 && !previewLoading;
  const customerOptions = customers.map((c) => ({ value: c.id, label: `${c.companyName}${c.ico ? ` · ${c.ico}` : ""}` }));
  const hasLines = !!p && p.lines.length > 0;
  const customerLine = p?.customer
    ? [p.customer.address, p.customer.ico && `IČO ${p.customer.ico}`, p.customer.dic && `DIČ ${p.customer.dic}`].filter(Boolean).join(" · ")
    : "";

  // Closing the picker unmounts it: give keyboard focus back to the pencil, unless the user already moved on.
  const closePicker = () => {
    refocusPencil.current = !!pickerRef.current?.nativeElement?.contains(document.activeElement);
    setPickingCustomer(false);
  };
  useEffect(() => {
    if (pickingCustomer || !refocusPencil.current) return;
    refocusPencil.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) pencilRef.current?.focus();
  }, [pickingCustomer]);

  // The same customer picker in both places; behind the pencil it opens at once and hides again when closed.
  const customerSelect = (behindPencil: boolean) => (
    <Select
      ref={behindPencil ? pickerRef : undefined}
      size="small"
      showSearch
      placeholder={p?.customer ? "Change customer" : "Pick customer"}
      value={null}
      onChange={(v) => {
        if (!behindPencil) setPickingCustomer(false);
        if (v) handlePickCustomer(v);
      }}
      disabled={linkCustomer.isPending}
      options={customerOptions}
      optionFilterProp="label"
      className="w-[220px] max-w-full"
      aria-label="Customer to invoice"
      notFoundContent={<span className="text-[12.5px]">No customers — add one in the <Link href="/customers">Customer Database</Link></span>}
      autoFocus={behindPencil}
      defaultOpen={behindPencil}
      onOpenChange={behindPencil ? (open) => !open && closePicker() : undefined}
    />
  );

  return (
    <>
      {section === "invoice" && (
        // overflow-clip, not overflow-hidden: hidden makes the card a scroll container and the sticky Issue bar would not stick
        // Same frame as the app's SectionCard
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip">
          {/* ── Customer and terms, in the job card's style ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-x-4 gap-y-3 px-4 py-4 border-b border-slate-100">
            {p && !p.customer ? (
              <Fact label="Bill to" className="col-span-2 md:col-span-4 xl:col-span-1" sub="Pick one from the Customer Database — it is also linked to the shipment.">
                <span className="font-medium text-warn">No customer linked</span>
                {customerSelect(false)}
              </Fact>
            ) : (
              // also while the preview loads or failed: a neutral dash, the picker still behind the pencil
              <Fact
                label="Bill to"
                className="col-span-2 md:col-span-4 xl:col-span-1"
                sub={
                  p?.customer && (
                    <>
                      {customerLine && <div>{customerLine}</div>}
                      {!shipment.customerId && customerId && <div className="mt-0.5">Linked to the shipment as its customer.</div>}
                    </>
                  )
                }
              >
                {pickingCustomer ? (
                  customerSelect(true)
                ) : (
                  <>
                    {p?.customer ? (
                      <span className="font-semibold min-w-0">
                        {p.customerId ? <Link href={`/customers/${p.customerId}`} className="text-slate-900 hover:text-indigo-600">{p.customer.companyName}</Link> : p.customer.companyName}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    <Tooltip title={p?.customer ? "Change customer" : "Pick customer"}>
                      <Button
                        ref={pencilRef}
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        aria-label={p?.customer ? "Change customer" : "Pick customer"}
                        onClick={() => setPickingCustomer(true)}
                        className="!text-slate-400 hover:!text-slate-700"
                      />
                    </Tooltip>
                  </>
                )}
              </Fact>
            )}
            <Fact label="Issue date">{p ? czDate(p.issueDate) : "—"}</Fact>
            <Fact label="DUZP">
              <DatePicker
                size="small"
                allowClear={false}
                format="D.M.YYYY"
                value={p ? dayjs(duzp ?? p.duzp) : null}
                onChange={(d) => d && setDuzp(d.format("YYYY-MM-DD"))}
                className="w-[140px] max-w-full"
                aria-label="DUZP"
              />
            </Fact>
            <Fact label="Due date">{p ? czDate(p.dueDate) : "—"}</Fact>
            <Fact
              label="Currency"
              sub={
                p && foreign ? (
                  <span className="tabular-nums">
                    1 {p.currency} = {p.fxRate.toFixed(3).replace(".", ",")} CZK · ČNB{p.fxFixingDate ? `, fixing ${czDate(p.fxFixingDate)}` : ""}
                  </span>
                ) : undefined
              }
            >
              <Select size="small" value={billingCur} onChange={(c) => billingCurrency.mutate(c)} loading={billingCurrency.isPending} disabled={billingCurrency.isPending} options={BILLING_CURRENCIES.map((c) => ({ value: c, label: c }))} className="w-[84px]" aria-label="Billing currency" />
            </Fact>
          </div>

          <div className="px-4 pt-3 pb-4">
            {previewError && <Alert type="error" showIcon className="mb-3" message="The invoice preview could not be loaded" />}

            {/* ── Lines ── */}
            {p && hasLines ? (
              // -mx-2: the cells' own padding lines the text up with the facts above
              <div className="overflow-x-auto -mx-2">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className={`${TH} text-left`}>Service</th>
                      <th className={`${TH} text-right w-[8%]`}>Qty</th>
                      <th className={`${TH} text-right w-[17%]`}>Price</th>
                      <th className={`${TH} text-left w-[18%]`}>VAT</th>
                      <th className={`${TH} text-right w-[18%]`}>Net ({p.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lines.map((l, i) => (
                      <tr key={l.sourceSellingCostId ?? i}>
                        <td className={TD}>{l.description}</td>
                        <td className={`${TD} text-right tabular-nums`}>{Number(l.qty)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{moneyCz(Number(l.unitPrice))} {l.unitCurrency}</td>
                        <td className={TD}>
                          {l.vatCode === "NP" ? (
                            <span className="text-slate-500">{VAT_LABEL.NP}</span>
                          ) : (
                            <Select<interfaces.SellingVatCode>
                              size="small"
                              value={l.vatCode}
                              onChange={(v) => handleLineVat(l.sourceSellingCostId, v)}
                              disabled={lineVat.isPending}
                              options={VAT_OPTIONS}
                              className="w-[140px]"
                              aria-label={`VAT code of ${l.description}`}
                            />
                          )}
                        </td>
                        <td className={`${TD} text-right tabular-nums font-medium`}>{moneyCz(Number(l.net))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : previewError ? null : !p && previewLoading ? (
              <p className="text-[13px] text-slate-500 m-0 py-2">Loading the invoice preview…</p>
            ) : (
              <div className="border border-dashed border-slate-300 rounded-xl px-4 py-4 flex items-center gap-3 flex-wrap">
                <FileTextOutlined className="!text-[22px] !text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-slate-900">No lines to invoice yet</div>
                  <div className="text-[12px] text-slate-500">Selling costs ticked for Invoice show up here.</div>
                </div>
                {onOpenCosts && <Button onClick={onOpenCosts}>Open Costs Breakdown</Button>}
              </div>
            )}

            {/* ── Totals; the VAT summary per code folds out ── */}
            {p && hasLines && (
              <>
                <div className="flex items-start justify-between gap-x-6 gap-y-2 flex-wrap pt-3">
                  <Button
                    type="text"
                    size="small"
                    icon={<DownOutlined rotate={vatOpen ? 180 : 0} className="!text-[10px]" />}
                    iconPosition="end"
                    aria-expanded={vatOpen}
                    aria-controls="invoice-vat-breakdown"
                    onClick={() => setVatOpen((o) => !o)}
                    className="-ml-1 !px-1 !text-[12.5px] !text-slate-500 hover:!text-slate-800"
                  >
                    VAT breakdown
                  </Button>
                  <div className="ml-auto text-right tabular-nums">
                    <div className="flex items-baseline justify-end gap-x-4 gap-y-1 flex-wrap">
                      <span className="text-[12.5px] text-slate-500">Net {moneyCz(p.net)} · VAT {moneyCz(p.vat)}</span>
                      <span className="text-[15px] font-bold text-slate-900">Total {moneyCz(p.gross)} {p.currency}</span>
                    </div>
                    {foreign && <div className="text-[12.5px] text-slate-500 mt-0.5">= {moneyCz(p.grossCzk)} CZK (VAT {moneyCz(p.vatCzk)} CZK)</div>}
                  </div>
                </div>
                <div id="invoice-vat-breakdown" hidden={!vatOpen} className="overflow-x-auto mt-2">
                  <table className="border-collapse text-[12.5px]">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left font-semibold pr-4 pb-1">VAT</th>
                        <th className="text-right font-semibold pr-4 pb-1">Base {p.currency}</th>
                        <th className="text-right font-semibold pr-4 pb-1">VAT {p.currency}</th>
                        {foreign && <th className="text-right font-semibold pr-4 pb-1">Base CZK</th>}
                        {foreign && <th className="text-right font-semibold pb-1">VAT CZK</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {p.vatSummary.map((v) => (
                        <tr key={v.vatCode} className="text-slate-700 tabular-nums">
                          <td className="pr-4">{VAT_LABEL[v.vatCode] ?? v.vatCode}</td>
                          <td className="text-right pr-4">{moneyCz(v.base)}</td>
                          <td className="text-right pr-4">{moneyCz(v.vat)}</td>
                          {foreign && <td className="text-right pr-4">{moneyCz(v.baseCzk)}</td>}
                          {foreign && <td className="text-right">{moneyCz(v.vatCzk)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── What needs a look before issuing ── */}
            {warnings.length > 0 && (
              <div className="flex flex-col gap-2 mt-4">
                {warnings.map((x) => (
                  <div key={x} className="flex items-start gap-2 text-[13px] text-warn bg-warn-faint border border-warn-soft rounded-md px-3 py-2">
                    <WarningOutlined className="mt-[3px]" />
                    <span>{x}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Issue: stays visible at the bottom of the screen while scrolling ── */}
          <div className="sticky bottom-0 z-10 px-4 py-3 bg-white/95 backdrop-blur border-t border-slate-200 flex items-center gap-3 flex-wrap">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note printed on the invoice (optional)"
              maxLength={300}
              className="flex-[1_1_200px] !min-w-[200px] max-w-[360px]"
              aria-label="Invoice note"
            />
            {/* status and button wrap together, so the button stays on the right */}
            <div className="flex-[3_1_360px] flex items-center justify-end gap-3 min-w-0">
              {/* what blocks issuing, or that nothing does */}
              <span className={`min-w-0 max-w-[480px] truncate text-[12.5px] ${problems.length ? "text-slate-500" : "text-ok font-medium"}`}>
                {problems[0] ?? (canIssue ? "Ready to issue" : "")}
              </span>
              <Tooltip title={canIssue ? "" : problems[0] ?? ""}>
                <Button type="primary" icon={<SendOutlined />} disabled={!canIssue} onClick={() => setConfirmKey(newKey())} className="shrink-0 tabular-nums">
                  {p && hasLines ? `Issue invoice · ${moneyCz(p.gross)} ${p.currency}` : "Issue invoice…"}
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {/* ── Issued documents ── */}
      {section === "documents" && (
        <SectionCard title="Invoices & credit notes">
          {docs.length === 0 ? (
            <p className="text-[13px] text-slate-500 m-0">None issued for this shipment yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td className={`${TD} font-mono font-medium`}>{d.number}</td>
                      <td className={TD}>
                        {d.kind === "credit_note" ? <Tag color="purple" bordered={false}>Credit note</Tag> : <Tag bordered={false}>Invoice</Tag>}
                        {d.status === "credited" && <Tag color="orange" bordered={false}>Credited</Tag>}
                      </td>
                      <td className={`${TD} text-slate-500`}>{czDate(d.issueDate)}</td>
                      <td className={`${TD} text-slate-600`}>{d.customer.companyName}</td>
                      <td className={`${TD} text-right tabular-nums font-medium`}>{moneyCz(Number(d.gross))} {d.currency}</td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <Button size="small" type="text" icon={<FilePdfOutlined />} loading={downloading === d.id} onClick={() => void download(d)}>
                          PDF
                        </Button>
                        {d.kind === "invoice" && d.status === "issued" && (
                          <Button size="small" type="text" icon={<RollbackOutlined />} onClick={() => setCreditTarget({ doc: d, key: newKey() })}>
                            Credit note…
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Confirm issuing ── */}
      <Modal
        open={!!confirmKey}
        title="Issue invoice"
        okText="Issue invoice"
        onOk={confirmIssue}
        confirmLoading={isIssuing}
        onCancel={() => setConfirmKey(null)}
        destroyOnHidden
      >
        {p && (
          <div className="text-[13px] text-slate-700 flex flex-col gap-2">
            <p className="m-0">
              Issue a tax document to <strong>{p.customer?.companyName}</strong> for{" "}
              <strong className="tabular-nums">{moneyCz(p.gross)} {p.currency}</strong>
              {foreign && <> (= {moneyCz(p.grossCzk)} CZK)</>}, DUZP {czDate(p.duzp)}, due {czDate(p.dueDate)}.
            </p>
            {notReleasedWarning && <Alert type="warning" showIcon message={notReleasedWarning} />}
            <p className="m-0 text-slate-500">
              It gets the next number of {shipment.jobNumber} and a PDF. An issued invoice can never be changed or deleted —
              a mistake is corrected with a credit note.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Credit note ── */}
      <Modal
        open={!!creditTarget}
        title={`Credit note for ${creditTarget?.doc.number ?? ""}`}
        okText="Issue credit note"
        okButtonProps={{ danger: true, disabled: !creditReason.trim() }}
        onOk={confirmCredit}
        confirmLoading={isCrediting}
        onCancel={() => { setCreditTarget(null); setCreditReason(""); }}
        destroyOnHidden
      >
        <div className="text-[13px] text-slate-700 flex flex-col gap-2">
          <p className="m-0">
            Reverses the whole invoice ({creditTarget && <strong className="tabular-nums">{moneyCz(Number(creditTarget.doc.gross))} {creditTarget.doc.currency}</strong>}) with the same
            rates and VAT. The reason is printed on the credit note.
          </p>
          <Input.TextArea
            value={creditReason}
            onChange={(e) => setCreditReason(e.target.value)}
            placeholder="Reason, e.g. wrong customer / wrong amount"
            maxLength={300}
            autoSize={{ minRows: 2 }}
            aria-label="Reason for the credit note"
          />
        </div>
      </Modal>
    </>
  );
}
