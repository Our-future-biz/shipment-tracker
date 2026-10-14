"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Alert, Button, DatePicker, Input, Modal, Select, Tag, Tooltip } from "antd";
import { FilePdfOutlined, RollbackOutlined, SendOutlined, WarningOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipments } from "@/hooks/useShipments";
import { useCustomers } from "@/hooks/useCustomers";
import { downloadInvoicePdf, useInvoiceDocs, type InvoiceDoc } from "@/hooks/useInvoiceDocs";
import { useToast } from "@/lib/toast";
import { moneyCz, round2 } from "@/lib/money";
import { statusLabel } from "@/lib/shipmentStatus";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";

/** Billing currencies we have exchange rates for (Exchange page: EUR, USD; CZK is the base). */
const BILLING_CURRENCIES = ["CZK", "EUR", "USD"];

/** VAT codes a line can be switched to (NP is set automatically for a non-VAT-payer). */
const VAT_OPTIONS = [
  { value: "Z69", label: "0 % §69" },
  { value: "S21", label: "21 %" },
  { value: "RC", label: "Reverse charge" },
  { value: "OUT", label: "Outside VAT" },
];
const VAT_LABEL: Record<string, string> = { ...Object.fromEntries(VAT_OPTIONS.map((o) => [o.value, o.label])), NP: "Not VAT payer" };

/** Operations release a job for billing by setting its Shipment Status to Billing (either direction). */
const isBillingStatus = (status: string | null | undefined) => /^Billing \[(IMP|EXP)\]$/.test((status ?? "").trim());

/** §28 ZDPH: a tax document must be issued within 15 days of the DUZP. */
const MAX_DAYS_AFTER_DUZP = 15;

const TH = "text-[11.5px] font-bold tracking-[.04em] uppercase text-slate-500 px-2 py-2 border-b border-slate-200";
const TD = "px-2 py-2 border-b border-slate-100 text-[13px] text-slate-700";
const czDate = (iso: string) => (iso ? dayjs(iso).format("D.M.YYYY") : "—");
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const Card = ({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) => (
  <div className="border border-slate-200 rounded-lg p-3 min-w-0">
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-[11.5px] font-bold uppercase tracking-[.04em] text-slate-500">{title}</span>
      {extra}
    </div>
    {children}
  </div>
);

/**
 * The invoice for one shipment. Everything shown is the server's preview (the same
 * calculation that issuing uses): selling rows ticked for Invoice, VAT code per line,
 * DUZP-week exchange rate, the customer and the issuer details. Issuing creates an
 * immutable tax document with a stored PDF; corrections go through a credit note.
 */
export function InvoicePanel({ shipment }: { shipment: ShipmentItem }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, billingCur, totals } = useCostsData(shipment);
  const { updateShipment } = useShipments();
  const { customers } = useCustomers();

  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [duzp, setDuzp] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [creditTarget, setCreditTarget] = useState<{ doc: InvoiceDoc; key: string } | null>(null);
  const [creditReason, setCreditReason] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  // the preview is recomputed whenever the rows it is built from change
  const previewKey = useMemo(() => JSON.stringify([billingCur, data?.sellingCosts ?? []]), [billingCur, data?.sellingCosts]);
  const { preview, previewLoading, previewError, docs, issue, isIssuing, credit, isCrediting } = useInvoiceDocs(shipment.id, {
    customerId,
    duzp,
    previewKey,
  });

  const refreshCosts = () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });

  const setBillingCurrency = async (currency: string) => {
    try {
      await api.invoicing.invoicingUpsertBillingSettings(shipment.id, { billingCurrency: currency });
      await refreshCosts();
    } catch {
      toast.error("Failed to change the billing currency");
    }
  };

  const setLineVat = async (sellingId: string | null, vatCode: string) => {
    if (!sellingId) return;
    try {
      await api.invoicing.invoicingUpdateSellingCost(shipment.id, sellingId, { vatCode });
      await refreshCosts();
    } catch {
      toast.error("Failed to change the VAT code");
    }
  };

  /** Picking a customer for a shipment that has none also links it, as on the shipment page. */
  const pickCustomer = async (id: string) => {
    setCustomerId(id);
    if (shipment.customerId) return;
    const c = customers.find((x) => x.id === id);
    try {
      await updateShipment({ id: shipment.id, data: { customer: c?.companyName ?? "", customerId: id } });
      toast.success(`${c?.companyName ?? "Customer"} linked to ${shipment.jobNumber}`);
    } catch {
      toast.error("The customer is used for this invoice, but linking it to the shipment failed");
    }
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
  const foreign = !!p && p.currency !== "CZK";
  // profit against buying costs, both in the invoice currency
  const cost = round2(totals.buyTotal);
  const profit = p ? round2(p.net - cost) : 0;
  const marginPct = p && p.net ? (profit / p.net) * 100 : null;
  const profitTone = profit > 0 ? "text-[#177245]" : profit < 0 ? "text-[#C3392B]" : "text-slate-700";

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
    if (p.fxSource === "older" || p.fxSource === "newest") warnings.push(`No exchange rates for the DUZP week — rates of ${p.fxWeek} are used. Add the right week on the Exchange page if needed.`);
  }
  const problems = p?.problems ?? [];
  const canIssue = !!p && problems.length === 0 && !previewLoading;
  const customerOptions = customers.map((c) => ({ value: c.id, label: `${c.companyName}${c.ico ? ` · ${c.ico}` : ""}` }));

  return (
    // overflow-clip, not overflow-hidden: hidden makes the card a scroll container and the sticky Issue bar would not stick
    <div className="bg-white border border-slate-200 rounded-xl overflow-clip mb-4">
      <div className="h-[38px] px-4 flex items-center gap-3 text-[12.5px] font-bold uppercase tracking-[.05em] bg-indigo-50 text-indigo-700">
        <span>Invoice</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal font-medium text-[12.5px] text-slate-600">
          Billing currency
          <Select size="small" value={billingCur} onChange={setBillingCurrency} options={BILLING_CURRENCIES.map((c) => ({ value: c, label: c }))} className="w-[84px]" aria-label="Billing currency" />
        </span>
      </div>

      <div className="p-4">
        {previewError && <Alert type="error" showIcon className="mb-3" message="The invoice preview could not be loaded" />}

        {/* ── Customer + terms ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <Card
            title="Bill to"
            extra={
              <Select
                size="small"
                showSearch
                placeholder={p?.customer ? "Change customer" : "Pick customer"}
                value={null}
                onChange={(v) => v && void pickCustomer(v)}
                options={customerOptions}
                optionFilterProp="label"
                className="w-[220px]"
                aria-label="Customer to invoice"
                notFoundContent={<span className="text-[12.5px]">No customers — add one in the <Link href="/customers">Customer Database</Link></span>}
              />
            }
          >
            {p?.customer ? (
              <div className="text-[13px] text-slate-700 leading-5">
                <div className="font-semibold text-slate-900">
                  {p.customerId ? <Link href={`/customers/${p.customerId}`} className="text-slate-900 hover:text-indigo-600">{p.customer.companyName}</Link> : p.customer.companyName}
                </div>
                <div>{p.customer.address}</div>
                <div className="text-slate-500">
                  {p.customer.ico && <>IČO {p.customer.ico}</>}
                  {p.customer.dic && <> · DIČ {p.customer.dic}</>}
                </div>
                {!shipment.customerId && customerId && <div className="text-[12px] text-slate-500 mt-1">Linked to the shipment as its customer.</div>}
              </div>
            ) : (
              <p className="text-[13px] text-slate-500 m-0">
                No customer linked to {shipment.jobNumber}. Pick one from the Customer Database — it is also linked to the shipment.
              </p>
            )}
          </Card>

          <Card title="Terms">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 items-center text-[13px]">
              <span className="text-slate-500">Issue date</span>
              <span className="text-slate-900">{p ? czDate(p.issueDate) : "—"}</span>
              <span className="text-slate-500">DUZP (tax point)</span>
              <DatePicker
                size="small"
                allowClear={false}
                format="D.M.YYYY"
                value={p ? dayjs(duzp ?? p.duzp) : null}
                onChange={(d) => d && setDuzp(d.format("YYYY-MM-DD"))}
                className="w-[140px]"
                aria-label="DUZP"
              />
              <span className="text-slate-500">Due date</span>
              <span className="text-slate-900">{p ? czDate(p.dueDate) : "—"}</span>
              {foreign && (
                <>
                  <span className="text-slate-500">Exchange rate</span>
                  <span className="text-slate-900 tabular-nums">
                    1 {p!.currency} = {p!.fxRate.toFixed(3).replace(".", ",")} CZK <span className="text-slate-500">({p!.fxWeek})</span>
                  </span>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* ── Lines ── */}
        {!p || p.lines.length === 0 ? (
          <p className="text-[13px] text-slate-500 m-0 mb-4">
            Nothing to invoice yet. Add selling costs in the Costs section above and tick them for Invoice.
          </p>
        ) : (
          <div className="overflow-x-auto mb-4">
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
                        <Select
                          size="small"
                          value={l.vatCode}
                          onChange={(v) => void setLineVat(l.sourceSellingCostId, v)}
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
        )}

        {/* ── Totals ── */}
        {p && p.lines.length > 0 && (
          <div className="flex items-start justify-between gap-6 flex-wrap border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-3">
              <div className="flex gap-6 text-[13px]">
                <div>
                  <div className="text-slate-500">Cost</div>
                  <div className="font-semibold text-slate-900 tabular-nums">{moneyCz(cost)} {p.currency}</div>
                </div>
                <div>
                  <div className="text-slate-500">Profit</div>
                  <div className={`font-semibold tabular-nums ${profitTone}`}>{moneyCz(profit)} {p.currency}</div>
                </div>
                <div>
                  <div className="text-slate-500">Margin</div>
                  <div className={`font-semibold tabular-nums ${profitTone}`}>{marginPct === null ? "—" : `${marginPct.toFixed(1).replace(".", ",")} %`}</div>
                </div>
              </div>
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
            <div className="text-right">
              <div className="text-[12.5px] text-slate-500 tabular-nums">Net {moneyCz(p.net)} · VAT {moneyCz(p.vat)} {p.currency}</div>
              <div className="text-[12px] font-bold uppercase tracking-[.05em] text-slate-500 mt-1">Total due</div>
              <div className="text-[24px] font-bold text-slate-900 tabular-nums leading-tight">
                {moneyCz(p.gross)} <span className="text-[15px] font-semibold text-slate-500">{p.currency}</span>
              </div>
              {foreign && <div className="text-[12.5px] text-slate-500 tabular-nums">= {moneyCz(p.grossCzk)} CZK (VAT {moneyCz(p.vatCzk)} CZK)</div>}
            </div>
          </div>
        )}

        {/* ── What blocks issuing / needs a look ── */}
        {(problems.length > 0 || warnings.length > 0) && (
          <div className="flex flex-col gap-2 mt-4">
            {problems.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message="Before the invoice can be issued"
                description={
                  <ul className="m-0 pl-4">
                    {problems.map((x) => (
                      <li key={x}>
                        {x.includes("Settings → Organization") ? (
                          <>{x.replace(" (Settings → Organization)", "")} — <Link href="/settings/organization">Settings → Organization</Link></>
                        ) : x.includes("Exchange page") ? (
                          <>{x.replace(" — add it on the Exchange page", "")} — <Link href="/exchange">add it on the Exchange page</Link></>
                        ) : (
                          x
                        )}
                      </li>
                    ))}
                  </ul>
                }
              />
            )}
            {warnings.map((x) => (
              <div key={x} className="flex items-start gap-2 text-[13px] text-[#9A5B00] bg-[#FFF6E5] border border-[#F5D9A8] rounded-md px-3 py-2">
                <WarningOutlined className="mt-[3px]" />
                <span>{x}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Issue: stays visible at the bottom of the screen while scrolling ── */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 px-4 py-3 bg-white/95 backdrop-blur border-t border-slate-200 flex items-center gap-3 flex-wrap">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note printed on the invoice (optional)"
            maxLength={300}
            className="!w-[360px] max-w-full"
            aria-label="Invoice note"
          />
          <span className="ml-auto text-[13px] text-slate-500 tabular-nums">
            {p && p.lines.length > 0 && (
              <>Total due <strong className="text-[16px] text-slate-900">{moneyCz(p.gross)} {p.currency}</strong></>
            )}
          </span>
          <Tooltip title={canIssue ? "" : problems[0] ?? ""}>
            <Button type="primary" icon={<SendOutlined />} disabled={!canIssue} onClick={() => setConfirmKey(newKey())}>
              Issue invoice…
            </Button>
          </Tooltip>
        </div>

        {/* ── Issued documents ── */}
        <div className="mt-6 border-t border-slate-100 pt-3">
          <div className="text-[11.5px] font-bold uppercase tracking-[.04em] text-slate-500 mb-2">Issued invoices &amp; credit notes</div>
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
        </div>
      </div>

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
    </div>
  );
}
