"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Alert, Button, Checkbox, DatePicker, Dropdown, Input, Modal, Popover, Select, Tag, Tooltip, type RefSelectProps } from "antd";
import {
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  FilterOutlined,
  RightOutlined,
  SearchOutlined,
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
import { chargeLabel } from "@/lib/chargeCodes";
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

/** A row of the lines table: an invoice line (ticked), or a selling row left off the invoice. */
interface TableRow {
  key: string;
  sellingId: string | null;
  line?: interfaces.InvoiceDocLineItem;
  row?: interfaces.SellingCostItem;
}
const czDate = (iso: string) => formatDate(iso) || "—";

/** The two views of the lines card: what goes on the next invoice, and what was invoiced already. */
type LinesView = "to_invoice" | "invoiced";
const INVOICE_STATUS: Record<interfaces.InvoiceDocStatus, { label: string; className: string }> = {
  issued: { label: "Issued", className: "bg-emerald-50 text-emerald-700" },
  credited: { label: "Credited", className: "bg-orange-50 text-orange-700" },
};
const TOOL_BUTTON =
  "flex items-center justify-center shrink-0 rounded-lg border border-slate-200 bg-white w-8 h-8 p-0 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors cursor-pointer";
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
  // the lines card: its view, search and filters (display only)
  const [linesView, setLinesView] = useState<LinesView>("to_invoice");
  const [lineQuery, setLineQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Set<string>>(() => new Set());
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

  // The tick is the selling row's "Invoice" flag, the same one Costs Breakdown shows.
  const lineTick = useMutation({
    mutationFn: async ({ sellingIds, invoice }: { sellingIds: string[]; invoice: boolean }) => {
      await Promise.all(sellingIds.map((id) => api.invoicing.invoicingUpdateSellingCost(shipment.id, id, { invoice })));
    },
    onSuccess: refreshCosts,
    onError: () => toast.error("Failed to change which lines are invoiced"),
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
  // The table: the invoice's lines (ticked selling rows) and, greyed, the selling rows left unticked,
  // so a line can be put back. Kept in the Costs Breakdown order.
  const sellingRows = data?.sellingCosts ?? [];
  const orderOf = (id: string | null) => sellingRows.find((r) => r.id === id)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const tableRows: TableRow[] = p
    ? [
        ...p.lines.map((l, i): TableRow => ({ key: l.sourceSellingCostId ?? `line-${i}`, sellingId: l.sourceSellingCostId, line: l })),
        ...sellingRows
          .filter((r) => !r.invoice && Number(r.amount ?? 0) !== 0)
          .map((r): TableRow => ({ key: r.id, sellingId: r.id, row: r })),
      ].sort((a, b) => orderOf(a.sellingId) - orderOf(b.sellingId))
    : [];
  const rowDescription = (t: TableRow) => (t.line ? t.line.description : t.row!.customer.trim() || chargeLabel(t.row!.category) || "Service");
  const rowCurrency = (t: TableRow) => (t.line ? t.line.unitCurrency : t.row!.currency);
  const words = lineQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const shownRows = tableRows.filter(
    (t) => matches(rowDescription(t)) && (currencyFilter.length === 0 || currencyFilter.includes(rowCurrency(t))),
  );
  const tickable = shownRows.filter((t) => t.sellingId);
  const tickedCount = tickable.filter((t) => t.line).length;
  const setTicks = (invoice: boolean) =>
    lineTick.mutate({ sellingIds: tickable.filter((t) => !!t.line !== invoice).map((t) => t.sellingId!), invoice });
  const lineCurrencies = Array.from(new Set(tableRows.map(rowCurrency))).sort();

  // Invoiced: the issued invoices of the job (credit notes stay in the Invoices & Credit Notes tab).
  const issuedInvoices = docs.filter((d) => d.kind === "invoice");
  const shownInvoices = issuedInvoices.filter(
    (d) =>
      (words.length === 0 || matches(d.number) || d.lines.some((l) => matches(l.description))) &&
      (statusFilter.length === 0 || statusFilter.includes(d.status)),
  );
  const toggleInvoice = (id: string) =>
    setOpenInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const activeFilters = linesView === "to_invoice" ? currencyFilter : statusFilter;
  // the address on one line, IČO and DIČ together on the next (no separator left hanging)
  const customerAddress = p?.customer?.address ?? "";
  const customerIds = p?.customer
    ? [p.customer.ico && `IČO ${p.customer.ico}`, p.customer.dic && `DIČ ${p.customer.dic}`].filter(Boolean).join(" · ")
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
        // Two cards in the SectionCard frame: who and when on top, what and how much below
        <div className="flex flex-col gap-4">
        {/* ── Customer and terms, in the job card's style ── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-x-4 gap-y-3 px-4 py-4">
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
                      {customerAddress && <div>{customerAddress}</div>}
                      {customerIds && <div className="whitespace-nowrap">{customerIds}</div>}
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
            <Fact label="Currency">
              <Select size="small" value={billingCur} onChange={(c) => billingCurrency.mutate(c)} loading={billingCurrency.isPending} disabled={billingCurrency.isPending} options={BILLING_CURRENCIES.map((c) => ({ value: c, label: c }))} className="w-[84px]" aria-label="Billing currency" />
            </Fact>
          </div>
        </div>

        {/* ── Lines, totals and Issue ── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip">
          {/* ── The card's tabs, search and tools ── */}
          <div className="flex items-center gap-3 flex-wrap px-4 border-b border-slate-200">
            <div role="tablist" aria-label="Invoice lines" className="flex items-center gap-4 self-stretch">
              {(
                [
                  { key: "to_invoice", label: "To invoice", count: p ? p.lines.length : undefined },
                  { key: "invoiced", label: "Invoiced", count: issuedInvoices.length },
                ] as const
              ).map((t) => {
                const active = linesView === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setLinesView(t.key)}
                    className={`flex items-center gap-2 py-3 -mb-px bg-transparent border-0 border-b-2 cursor-pointer text-sm transition-colors ${
                      active ? "border-indigo-500 text-indigo-600 font-semibold" : "border-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                    {t.count !== undefined && (
                      <span className={`rounded px-1.5 text-xs font-medium leading-5 ${active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 ml-auto py-2">
              <Input
                placeholder={linesView === "to_invoice" ? "Search services..." : "Search invoices..."}
                aria-label={linesView === "to_invoice" ? "Search services" : "Search invoices"}
                prefix={<SearchOutlined className="text-slate-400" />}
                value={lineQuery}
                onChange={(e) => setLineQuery(e.target.value)}
                allowClear
                className="!w-56"
              />
              <Popover
                trigger="click"
                placement="bottomRight"
                content={
                  linesView === "to_invoice" ? (
                    <div className="flex flex-col gap-2 min-w-[160px]">
                      <div className="text-[11px] font-bold uppercase tracking-[.04em] text-slate-500">Currency</div>
                      <Checkbox.Group
                        className="flex flex-col gap-1"
                        value={currencyFilter}
                        onChange={(v) => setCurrencyFilter(v as string[])}
                        options={lineCurrencies.map((c) => ({ value: c, label: c }))}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 min-w-[160px]">
                      <div className="text-[11px] font-bold uppercase tracking-[.04em] text-slate-500">Status</div>
                      <Checkbox.Group
                        className="flex flex-col gap-1"
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v as string[])}
                        options={Object.entries(INVOICE_STATUS).map(([value, x]) => ({ value, label: x.label }))}
                      />
                    </div>
                  )
                }
              >
                <Tooltip title="Filter">
                  <button
                    type="button"
                    aria-label="Filter"
                    className={`${TOOL_BUTTON} ${activeFilters.length ? "!border-indigo-400 !text-indigo-600 !bg-indigo-50" : ""}`}
                  >
                    <FilterOutlined />
                  </button>
                </Tooltip>
              </Popover>
              <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                menu={{
                  items: [
                    // ticking every line is the checkbox in the table header, so it is not repeated here
                    ...(linesView === "invoiced"
                      ? [
                          { key: "expand", label: "Expand all", disabled: shownInvoices.length === 0 },
                          { key: "collapse", label: "Collapse all", disabled: openInvoices.size === 0 },
                          ...(onOpenCosts ? [{ type: "divider" as const }] : []),
                        ]
                      : []),
                    ...(onOpenCosts ? [{ key: "costs", label: "Open Costs Breakdown" }] : []),
                  ],
                  onClick: ({ key }) => {
                    if (key === "expand") setOpenInvoices(new Set(shownInvoices.map((d) => d.id)));
                    if (key === "collapse") setOpenInvoices(new Set());
                    if (key === "costs") onOpenCosts?.();
                  },
                }}
              >
                <button type="button" aria-label="More actions" className={TOOL_BUTTON}>
                  <EllipsisOutlined />
                </button>
              </Dropdown>
            </div>
          </div>

          {linesView === "to_invoice" && (
          <>
          <div className="px-4 pt-3 pb-4">
            {previewError && <Alert type="error" showIcon className="mb-3" message="The invoice preview could not be loaded" />}

            {/* ── Lines ── */}
            {p && tableRows.length > 0 ? (
              // -mx-2: the cells' own padding lines the text up with the facts above
              <div className="overflow-x-auto -mx-2">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className={`${TH} w-8`}>
                        <Checkbox
                          checked={tickable.length > 0 && tickedCount === tickable.length}
                          indeterminate={tickedCount > 0 && tickedCount < tickable.length}
                          disabled={lineTick.isPending || tickable.length === 0}
                          onChange={(e) => setTicks(e.target.checked)}
                          aria-label="Put every line shown on the invoice"
                        />
                      </th>
                      <th className={`${TH} text-left`}>Service</th>
                      <th className={`${TH} text-right w-[8%]`}>Qty</th>
                      <th className={`${TH} text-right w-[17%]`}>Price</th>
                      <th className={`${TH} text-left w-[18%]`}>VAT</th>
                      <th className={`${TH} text-right w-[18%]`}>Net ({p.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className={`${TD} text-center text-slate-500 py-6`}>
                          No lines match the search or filter.
                        </td>
                      </tr>
                    )}
                    {shownRows.map((t) => {
                      const l = t.line;
                      const description = rowDescription(t);
                      const muted = l ? "" : " !text-slate-400";
                      return (
                        <tr key={t.key}>
                          <td className={`${TD} w-8`}>
                            {t.sellingId && (
                              <Checkbox
                                checked={!!l}
                                disabled={lineTick.isPending}
                                onChange={(e) => lineTick.mutate({ sellingIds: [t.sellingId!], invoice: e.target.checked })}
                                aria-label={`Put ${description} on the invoice`}
                              />
                            )}
                          </td>
                          <td className={`${TD}${muted}`}>{description}</td>
                          <td className={`${TD} text-right tabular-nums${muted}`}>{Number(l ? l.qty : t.row!.qty ?? 1) || 1}</td>
                          <td className={`${TD} text-right tabular-nums${muted}`}>
                            {moneyCz(Number(l ? l.unitPrice : t.row!.amount))} {l ? l.unitCurrency : t.row!.currency}
                          </td>
                          <td className={TD}>
                            {!l ? (
                              <span className="text-slate-400">Not invoiced</span>
                            ) : l.vatCode === "NP" ? (
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
                          <td className={`${TD} text-right tabular-nums font-medium${muted}`}>{l ? moneyCz(Number(l.net)) : "—"}</td>
                        </tr>
                      );
                    })}
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

          {/* ── Issue: the card's own last row; it does not follow the scroll ── */}
          <div className="px-4 py-3 bg-slate-50/60 rounded-b-xl border-t border-slate-200 flex items-center gap-3 flex-wrap">
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
          </>
          )}

          {/* ── Invoiced: the job's issued invoices, each folding out to its lines ── */}
          {linesView === "invoiced" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className={`${TH} w-10 !pl-4`}>
                      <span className="sr-only">Lines</span>
                    </th>
                    <th className={`${TH} text-left`}>Invoice</th>
                    <th className={`${TH} text-left`}>Date</th>
                    <th className={`${TH} text-right`}>Items</th>
                    <th className={`${TH} text-right`}>Total (CZK)</th>
                    <th className={`${TH} text-left !pl-6 !pr-4`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shownInvoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className={`${TD} text-center text-slate-500 py-6`}>
                        {issuedInvoices.length === 0 ? "No invoice issued for this job yet." : "No invoices match the search or filter."}
                      </td>
                    </tr>
                  )}
                  {shownInvoices.map((d) => {
                    const open = openInvoices.has(d.id);
                    const status = INVOICE_STATUS[d.status];
                    return (
                      <Fragment key={d.id}>
                        <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleInvoice(d.id)}>
                          <td className={`${TD} !pl-4`}>
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={`${open ? "Hide" : "Show"} the lines of ${d.number}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleInvoice(d.id);
                              }}
                              className="bg-transparent border-0 p-1 cursor-pointer text-slate-500 hover:text-slate-900"
                            >
                              <RightOutlined rotate={open ? 90 : 0} className="!text-[11px]" />
                            </button>
                          </td>
                          <td className={TD}>
                            <Tooltip title={d.hasPdf ? "Download the PDF" : ""}>
                              <button
                                type="button"
                                disabled={!d.hasPdf || downloading === d.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void download(d);
                                }}
                                className="bg-transparent border-0 p-0 font-mono font-semibold text-indigo-600 hover:underline cursor-pointer disabled:cursor-default disabled:no-underline"
                              >
                                {d.number}
                              </button>
                            </Tooltip>
                          </td>
                          <td className={`${TD} tabular-nums`}>{czDate(d.issueDate)}</td>
                          <td className={`${TD} text-right tabular-nums`}>{d.lines.length}</td>
                          <td className={`${TD} text-right tabular-nums font-medium`}>{moneyCz(Number(d.grossCzk))}</td>
                          <td className={`${TD} !pl-6 !pr-4`}>
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[12px] font-medium ${status.className}`}>{status.label}</span>
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={6} className="px-4 py-3 border-b border-slate-100 bg-slate-50/40">
                              <div className="bg-white border border-slate-200 rounded-lg px-3 py-1">
                                <table className="w-full border-collapse">
                                  <thead>
                                    <tr>
                                      <th className={`${TH} text-left`}>Service</th>
                                      <th className={`${TH} text-right w-[8%]`}>Qty</th>
                                      <th className={`${TH} text-right w-[18%]`}>Price</th>
                                      <th className={`${TH} text-left w-[16%] !pl-6`}>VAT</th>
                                      <th className={`${TH} text-right w-[18%]`}>Net ({d.currency})</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.lines.map((l, i) => (
                                      <tr key={l.sourceSellingCostId ?? i}>
                                        <td className={TD}>{l.description}</td>
                                        <td className={`${TD} text-right tabular-nums`}>{Number(l.qty)}</td>
                                        <td className={`${TD} text-right tabular-nums`}>
                                          {moneyCz(Number(l.unitPrice))} {l.unitCurrency}
                                        </td>
                                        <td className={`${TD} !pl-6`}>{VAT_LABEL[l.vatCode] ?? l.vatCode}</td>
                                        <td className={`${TD} text-right tabular-nums`}>{moneyCz(Number(l.net))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
