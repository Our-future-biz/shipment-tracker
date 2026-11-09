"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { Alert, App, Button, Checkbox, DatePicker, Dropdown, Input, Modal, Popover, Select, Tooltip, type RefSelectProps } from "antd";
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
import { api, apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { canChangeShipmentDetails, isDetailsManager } from "@/lib/shipmentEditRule";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useShipmentMutations } from "@/hooks/useShipments";
import { useCustomers } from "@/hooks/useCustomers";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { downloadInvoicePdf, useInvoiceDocs, type InvoiceDoc } from "@/hooks/useInvoiceDocs";
import { mailtoLink, openMailto } from "@/lib/mailto";
import { invoiceEmailTo, shipmentEmailSubject } from "@/app/shipments/_lib/shipmentEmail";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/date";
import { CURRENCIES } from "@/lib/enums";
import { invoicingKey } from "@/hooks/useInvoicing";
import { INVOICE_KEYS } from "@/hooks/useInvoiceQueue";
import { isTruckingCost } from "@/lib/truckingCosts";
import { money, round2 } from "@/lib/money";
import { chargeLabel } from "@/lib/chargeCodes";
import { statusLabel } from "@/lib/shipmentStatus";
import { SectionCard } from "@/components/SectionCard";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { Pill } from "@/components/Pill";
import { CARD, HINT, ICON_BTN, ICON_BTN_GHOST, LABEL_TEXT, LINK, REF, TD, TD_TOTAL, TH } from "@/styles/ui";
import { useCostsData } from "@/app/shipments/[jobNumber]/tabs/useCostsData";
import { lineTableRows, type LineTableRow as TableRow } from "../_lib/lineTable";
import { IssuedInvoiceEmailModal, type IssuedInvoiceEmail } from "./IssuedInvoiceEmailModal";

/** Billing currencies offered: the ones the company invoices in, out of the app's currencies. */
// Offered for a shipment without a customer; one with a customer is billed in that customer's currencies.
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

const czDate = (iso: string) => formatDate(iso) || "—";

/** The two views of the lines card: what goes on the next invoice, and what was invoiced already. */
type LinesView = "to_invoice" | "invoiced";
const INVOICE_STATUS: Record<interfaces.InvoiceDocStatus, { label: string; tone: "green" | "amber" }> = {
  issued: { label: "Issued", tone: "green" },
  credited: { label: "Credited", tone: "amber" },
};
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
    <div className={`${LABEL_TEXT} whitespace-nowrap`}>{label}</div>
    <div className="mt-1 min-h-7 text-[13px] text-slate-900 flex items-center flex-wrap gap-x-2 gap-y-1 break-words">{children}</div>
    {sub && <div className={`${HINT} leading-[18px]`}>{sub}</div>}
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
  /** false: no note that the job is not released for Billing yet (the shipment's own Issue invoice). */
  billingStatusWarning?: boolean;
  /**
   * Told whether an invoice is being issued or a PDF downloaded, so a dialog holding the panel stays
   * open meanwhile: closed, the panel would go and the email step after issuing with it.
   */
  onBusyChange?: (busy: boolean) => void;
}

// Why a customer picked here is not linked to the shipment.
const NOT_LINKED_HINT = "Only the shipment's Person in Charge, Holiday Cover or a manager can link it to the shipment.";

export function InvoicePanel({ shipment, section, onDuzpChange, onOpenCosts, billingStatusWarning = true, onBusyChange }: InvoicePanelProps) {
  const toast = useToast();
  const { modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data, billingCur } = useCostsData(shipment);
  const { updateShipment } = useShipmentMutations();
  const { customers } = useCustomers();
  // The shipment's Customer is one of its details (lib/shipmentEditRule): whoever may not change them
  // still picks whom to bill, but the pick is not linked to the shipment (the server would refuse it).
  const { user } = useAuth();
  const mayLinkCustomer = canChangeShipmentDetails(user, shipment);

  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [duzp, setDuzp] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [creditTarget, setCreditTarget] = useState<{ doc: InvoiceDoc; key: string } | null>(null);
  const [creditReason, setCreditReason] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [issuedEmail, setIssuedEmail] = useState<IssuedInvoiceEmail | null>(null);
  const { contacts: picContacts } = useCustomerContacts(shipment.customerId ?? "");
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
  const { preview, previewLoading, previewError, docs, docsLoading, issue, isIssuing, credit, isCrediting } = useInvoiceDocs(shipment.id, {
    customerId,
    duzp,
    previewKey,
  });

  // Issuing runs on to its PDF and the email: until both are done the holder must keep the panel.
  const busy = isIssuing || isCrediting || downloading !== null;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // The queue's counts (to bill, lines invoiced) come from the same rows, so it is marked stale too.
  const refreshCosts = () => {
    void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.queueAll });
    return queryClient.invalidateQueries({ queryKey: invoicingKey(shipment.id) });
  };

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
    onError: (e) => toast.error(`Failed to change the VAT code: ${apiErrorMessage(e)}`),
  });

  // The text printed on a line: its own text (the selling row's `customer`), else the row's
  // Description, else the category.
  const lineText = useMutation({
    mutationFn: ({ sellingId, text }: { sellingId: string; text: string }) =>
      api.invoicing.invoicingUpdateSellingCost(shipment.id, sellingId, { customer: text }),
    onSuccess: refreshCosts,
    onError: (e) => toast.error(`Failed to change the line text: ${apiErrorMessage(e)}`),
  });

  // The tick is the selling row's "Invoice" flag, the same one Costs Breakdown shows.
  // Several rows at once (the header checkbox): every request runs to its end, and the rows are
  // reloaded even when one failed, so the table never shows a tick the server does not have.
  const lineTick = useMutation({
    mutationFn: async ({ sellingIds, invoice }: { sellingIds: string[]; invoice: boolean }) => {
      const results = await Promise.allSettled(
        sellingIds.map((id) => api.invoicing.invoicingUpdateSellingCost(shipment.id, id, { invoice })),
      );
      if (results.some((r) => r.status === "rejected")) throw new Error("Some lines could not be changed");
    },
    onSettled: refreshCosts,
    onError: () => toast.error("Failed to change which lines are invoiced"),
  });

  // The customer the invoice is for and the currencies it is billed in: its default, then up to
  // two secondary ones (billing in one of those asks to confirm). Without a customer: CZK, EUR, USD.
  const billToId = customerId ?? shipment.customerId ?? undefined;
  const billTo = billToId ? customers.find((c) => c.id === billToId) : undefined;
  const allowedCurrencies = billTo ? [billTo.currency, ...billTo.secondaryCurrencies] : [...BILLING_CURRENCIES];
  // A currency saved before (or since dropped from the customer) still shows as the current one.
  const currencyOptions = (allowedCurrencies.includes(billingCur) ? allowedCurrencies : [billingCur, ...allowedCurrencies]).map((c) => ({
    value: c,
    label: billTo && c === billTo.currency ? `${c} · default` : c,
  }));

  const changeBillingCurrency = (currency: string) => {
    if (!billTo?.secondaryCurrencies.includes(currency)) {
      billingCurrency.mutate(currency);
      return;
    }
    modal.confirm({
      title: `Bill ${billTo.companyName} in ${currency}?`,
      content: `${currency} is an alternative currency for this customer; their default is ${billTo.currency}. Do you really want to bill this shipment in ${currency}?`,
      okText: `Bill in ${currency}`,
      cancelText: `Keep ${billingCur}`,
      onOk: () => billingCurrency.mutateAsync(currency),
    });
  };

  const linkCustomer = useMutation({
    mutationFn: (id: string) => {
      const c = customers.find((x) => x.id === id);
      return updateShipment({ id: shipment.id, data: { customer: c?.companyName ?? "", customerId: id } }).then(() => c);
    },
    onSuccess: (c) => toast.success(`${c?.companyName ?? "Customer"} linked to ${shipment.jobNumber}`),
    onError: (e) => toast.error(`The customer is used for this invoice, but linking it to the shipment failed: ${apiErrorMessage(e)}`),
  });

  const handleLineVat = (sellingId: string | null, vatCode: interfaces.SellingVatCode) => {
    if (sellingId) lineVat.mutate({ sellingId, vatCode });
  };

  /** Picking a customer for a shipment that has none also links it, as on the shipment page, for whoever may. */
  const handlePickCustomer = (id: string) => {
    setCustomerId(id);
    if (!shipment.customerId && mayLinkCustomer) linkCustomer.mutate(id);
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
      // The PDF first, then the email to put it in. The issued invoice stands whatever happens here.
      const to = invoiceEmailTo(shipment, invoice.customerId, picContacts);
      const subject = shipmentEmailSubject(shipment);
      const href = mailtoLink({ to, subject });
      setIssuedEmail({ id: invoice.id, number: invoice.number, to, subject, href });
      openMailto(href);
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
  const notReleasedWarning = releasedForBilling || !billingStatusWarning
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
    // The server's own (e.g. no bank account in the billing currency).
    warnings.push(...p.warnings);
  }
  const problems = p?.problems ?? [];
  const canIssue = !!p && problems.length === 0 && !previewLoading;
  // Billed to a customer: a company with no Customer role is not offered, unless it is the one chosen (K13).
  const customerOptions = customers
    .filter((c) => c.roles.includes("customer") || c.id === billToId)
    .map((c) => ({ value: c.id, label: `${c.companyName}${c.ico ? ` · ${c.ico}` : ""}` }));
  const hasLines = !!p && p.lines.length > 0;
  // The table: the invoice's lines (ticked selling rows) and, greyed, the selling rows left unticked,
  // so a line can be put back. Kept in the Costs Breakdown order (see lineTableRows).
  const sellingRows = data?.sellingCosts ?? [];
  const tableRows: TableRow[] = p ? lineTableRows(sellingRows, p.lines, docs) : [];
  // as the server names a line: its own text, else the row's Description, else the category
  const rowDescription = (t: TableRow) =>
    t.line ? t.line.description : t.row!.customer.trim() || t.row!.description.trim() || chargeLabel(t.row!.category) || "Service";
  // A line's VAT, as shown on its row (rounded per line; the invoice's VAT is counted per rate).
  const vatOfLine = (l: interfaces.InvoiceDocLineItem) => round2((Number(l.net) * (Number(l.vatRate) || 0)) / 100);
  const rowCurrency = (t: TableRow) => (t.line ? t.line.unitCurrency : t.row!.currency);
  const words = lineQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  // A currency picked earlier that no line has any more (billed, changed) no longer filters.
  const lineCurrencies = Array.from(new Set(tableRows.map(rowCurrency))).sort();
  const activeCurrencies = currencyFilter.filter((c) => lineCurrencies.includes(c));
  const shownRows = tableRows.filter(
    (t) => matches(rowDescription(t)) && (activeCurrencies.length === 0 || activeCurrencies.includes(rowCurrency(t))),
  );
  // Rows Trucking pushed are kept by Trucking: read-only here, as in Costs Breakdown.
  const isReadOnly = (t: TableRow) => isTruckingCost(sellingRows.find((r) => r.id === t.sellingId)?.sourceTruckingRef);
  // A master job's demurrage taken off the invoice is sold for nothing: only a manager may (the
  // server refuses anyone else, who asks for the row's deletion in Costs Breakdown).
  const untickLocked = (t: TableRow) =>
    t.ticked && !isDetailsManager(user?.role ?? "") && !!sellingRows.find((r) => r.id === t.sellingId)?.sourceMasterJobRef;
  const tickLocked = (t: TableRow) => isReadOnly(t) || untickLocked(t);
  const tickable = shownRows.filter((t) => t.sellingId && !tickLocked(t));
  const tickedCount = tickable.filter((t) => t.ticked).length;
  const setTicks = (invoice: boolean) => {
    const sellingIds = tickable.filter((t) => t.ticked !== invoice).map((t) => t.sellingId!);
    if (sellingIds.length) lineTick.mutate({ sellingIds, invoice });
  };

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
  const activeFilters = linesView === "to_invoice" ? activeCurrencies : statusFilter;
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
      notFoundContent={<span className="text-[13px]">No customers — add one in the <Link href="/customers">Customer Database</Link></span>}
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
        <div className={CARD}>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-x-4 gap-y-3 px-4 py-4">
            {p && !p.customer ? (
              <Fact
                label="Bill to"
                className="col-span-2 md:col-span-4 xl:col-span-1"
                sub={
                  mayLinkCustomer
                    ? "Pick one from the Customer Database — it is also linked to the shipment."
                    : `Pick one from the Customer Database for this invoice. ${NOT_LINKED_HINT}`
                }
              >
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
                      {!shipment.customerId && customerId && (
                        <div className="mt-0.5">{mayLinkCustomer ? "Linked to the shipment as its customer." : `Used for this invoice only. ${NOT_LINKED_HINT}`}</div>
                      )}
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
                        {p.customerId ? <Link href={`/customers/${p.customerId}`} className={LINK}>{p.customer.companyName}</Link> : p.customer.companyName}
                      </span>
                    ) : (
                      EMPTY_CELL
                    )}
                    <Tooltip title={p?.customer ? "Change customer" : "Pick customer"}>
                      <Button
                        ref={pencilRef}
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        aria-label={p?.customer ? "Change customer" : "Pick customer"}
                        onClick={() => setPickingCustomer(true)}
                      />
                    </Tooltip>
                  </>
                )}
              </Fact>
            )}
            <Fact label="Issue date">{p ? czDate(p.issueDate) : EMPTY_CELL}</Fact>
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
            <Fact label="Due date">{p ? czDate(p.dueDate) : EMPTY_CELL}</Fact>
            <Fact label="Currency">
              <Select size="small" value={billingCur} onChange={changeBillingCurrency} loading={billingCurrency.isPending} disabled={billingCurrency.isPending} options={currencyOptions} labelRender={(o) => o.value} popupMatchSelectWidth={false} className="w-[84px]" aria-label="Billing currency" />
            </Fact>
          </div>
        </div>

        {/* ── Lines, totals and Issue ── */}
        <div className={`${CARD} overflow-clip`}>
          {/* ── The card's tabs, search and tools ── */}
          <div className="flex items-center gap-3 flex-wrap px-4 border-b border-slate-200">
            <div role="tablist" aria-label="Invoice lines" className="flex items-center gap-4 self-stretch">
              {(
                [
                  { key: "to_invoice", label: "To invoice", count: p ? p.lines.length : undefined },
                  { key: "invoiced", label: "Invoiced", count: docsLoading ? undefined : issuedInvoices.length },
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
                    // the colours of the app's tab strip (RecordTabs), with a count on each tab
                    className={`flex items-center gap-2 py-3 -mb-px bg-transparent border-0 border-b-2 cursor-pointer text-[13px] whitespace-nowrap transition-colors ${
                      active ? "border-indigo-600 text-indigo-600 font-semibold" : "border-transparent text-slate-500 font-medium hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                    {t.count !== undefined && (
                      <span className={`rounded-full px-2 text-[11px] font-semibold leading-5 tabular-nums ${active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
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
                      <div className={LABEL_TEXT}>Currency</div>
                      <Checkbox.Group
                        className="flex flex-col gap-1"
                        value={activeCurrencies}
                        onChange={(v) => setCurrencyFilter(v as string[])}
                        options={lineCurrencies.map((c) => ({ value: c, label: c }))}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 min-w-[160px]">
                      <div className={LABEL_TEXT}>Status</div>
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
                    className={`${ICON_BTN} ${activeFilters.length ? "!border-indigo-500 !text-indigo-600 !bg-indigo-50" : ""}`}
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
                <button type="button" aria-label="More actions" className={ICON_BTN}>
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
                {/* Fixed columns: the figures sit together on the right, the line text takes the rest */}
                <table className="w-full min-w-[880px] border-collapse table-fixed">
                  <thead>
                    <tr>
                      <th className={`${TH} w-10`}>
                        <Checkbox
                          checked={tickable.length > 0 && tickedCount === tickable.length}
                          indeterminate={tickedCount > 0 && tickedCount < tickable.length}
                          disabled={lineTick.isPending || tickable.length === 0}
                          onChange={(e) => setTicks(e.target.checked)}
                          aria-label="Put every line shown on the invoice"
                        />
                      </th>
                      {/* Service and VAT heads start where the text in their fields does (8px in) */}
                      <th className={`${TH} text-left !pl-4`}>Service</th>
                      <th className={`${TH} !text-right w-[72px]`}>Qty</th>
                      <th className={`${TH} !text-right w-[140px]`}>Price</th>
                      <th className={`${TH} text-left !pl-4 w-[150px]`}>VAT rate</th>
                      {/* each line without VAT, its VAT and with VAT; the totals sit under them */}
                      <th className={`${TH} !text-right w-[120px]`}>Net ({p.currency})</th>
                      <th className={`${TH} !text-right w-[110px]`}>VAT ({p.currency})</th>
                      <th className={`${TH} !text-right w-[130px]`}>Total ({p.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className={`${TD} text-center !text-slate-500 !py-6`}>
                          No lines match the search or filter.
                        </td>
                      </tr>
                    )}
                    {shownRows.map((t) => {
                      const l = t.line;
                      const description = rowDescription(t);
                      const muted = t.ticked ? "" : " !text-slate-400";
                      return (
                        <tr key={t.key}>
                          <td className={`${TD} w-8`}>
                            {t.sellingId && (
                              <Checkbox
                                checked={t.ticked}
                                disabled={lineTick.isPending || tickLocked(t)}
                                title={
                                  isReadOnly(t)
                                    ? "Kept by Trucking — change it there"
                                    : untickLocked(t)
                                      ? "A master job's demurrage: only a manager takes it off the invoice"
                                      : undefined
                                }
                                onChange={(e) => lineTick.mutate({ sellingIds: [t.sellingId!], invoice: e.target.checked })}
                                aria-label={`Put ${description} on the invoice`}
                              />
                            )}
                          </td>
                          <td className={`${TD}${muted}`}>
                            <LineTextField
                              row={sellingRows.find((r) => r.id === t.sellingId)}
                              shown={description}
                              readOnly={isReadOnly(t)}
                              muted={!t.ticked}
                              onSave={(sellingId, text) => lineText.mutateAsync({ sellingId, text })}
                            />
                          </td>
                          <td className={`${TD} text-right tabular-nums${muted}`}>{Number(l ? l.qty : t.row!.qty ?? 1) || 1}</td>
                          <td className={`${TD} text-right tabular-nums${muted}`}>
                            {money(Number(l ? l.unitPrice : t.row!.amount))} {l ? l.unitCurrency : t.row!.currency}
                          </td>
                          <td className={TD}>
                            {!l ? (
                              <span className="text-slate-400">{t.ticked ? "…" : "Not invoiced"}</span>
                            ) : l.vatCode === "NP" ? (
                              <span className="text-slate-500">{VAT_LABEL.NP}</span>
                            ) : (
                              <Select<interfaces.SellingVatCode>
                                size="small"
                                value={l.vatCode}
                                onChange={(v) => handleLineVat(l.sourceSellingCostId, v)}
                                disabled={lineVat.isPending}
                                options={VAT_OPTIONS}
                                className="w-full"
                                aria-label={`VAT code of ${l.description}`}
                              />
                            )}
                          </td>
                          <td className={`${TD} text-right tabular-nums${muted}`}>{l ? money(Number(l.net)) : t.ticked ? "…" : EMPTY_CELL}</td>
                          <td className={`${TD} text-right tabular-nums${muted}`}>{l ? money(vatOfLine(l)) : t.ticked ? "…" : EMPTY_CELL}</td>
                          <td className={`${TD} text-right tabular-nums font-medium${muted}`}>{l ? money(round2(Number(l.net) + vatOfLine(l))) : t.ticked ? "…" : EMPTY_CELL}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* the invoice's totals (the server's: VAT is counted per rate), each under its column */}
                  {hasLines && (
                    <tfoot>
                      <tr>
                        <td colSpan={5} className={`${TD_TOTAL} align-middle`}>
                          <Button
                            type="text"
                            size="small"
                            icon={<DownOutlined rotate={vatOpen ? 180 : 0} className="!text-[10px]" />}
                            iconPosition="end"
                            aria-expanded={vatOpen}
                            aria-controls="invoice-vat-breakdown"
                            onClick={() => setVatOpen((o) => !o)}
                            className="-ml-2"
                          >
                            VAT breakdown
                          </Button>
                        </td>
                        <td className={`${TD_TOTAL} !text-right tabular-nums`}>{money(p.net)}</td>
                        <td className={`${TD_TOTAL} !text-right tabular-nums`}>{money(p.vat)}</td>
                        <td className={`${TD_TOTAL} !text-right tabular-nums !text-[14px] whitespace-nowrap`}>
                          {money(p.gross)} {p.currency}
                        </td>
                      </tr>
                      {foreign && (
                        <tr>
                          <td colSpan={8} className="px-2 pb-1 text-right tabular-nums text-[13px] text-slate-500">
                            = {money(p.grossCzk)} CZK (VAT {money(p.vatCzk)} CZK)
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  )}
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
                <div id="invoice-vat-breakdown" hidden={!vatOpen} className="overflow-x-auto mt-2">
                  <table className="border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>VAT</th>
                        <th className={`${TH} !text-right`}>Base {p.currency}</th>
                        <th className={`${TH} !text-right`}>VAT {p.currency}</th>
                        {foreign && <th className={`${TH} !text-right`}>Base CZK</th>}
                        {foreign && <th className={`${TH} !text-right`}>VAT CZK</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {p.vatSummary.map((v) => (
                        <tr key={v.vatCode} className="tabular-nums">
                          <td className={TD}>{VAT_LABEL[v.vatCode] ?? v.vatCode}</td>
                          <td className={`${TD} text-right`}>{money(v.base)}</td>
                          <td className={`${TD} text-right`}>{money(v.vat)}</td>
                          {foreign && <td className={`${TD} text-right`}>{money(v.baseCzk)}</td>}
                          {foreign && <td className={`${TD} text-right`}>{money(v.vatCzk)}</td>}
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
                  <div key={x} className="flex items-start gap-2 text-[13px] text-warn bg-warn-faint border border-warn-soft rounded-lg px-3 py-2">
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
              <span className={`min-w-0 max-w-[480px] truncate text-[13px] ${problems.length ? "text-slate-500" : "text-ok font-medium"}`}>
                {problems[0] ?? (canIssue ? "Ready to issue" : "")}
              </span>
              <Tooltip title={canIssue ? "" : problems[0] ?? ""}>
                <Button type="primary" icon={<SendOutlined />} disabled={!canIssue} onClick={() => setConfirmKey(newKey())} className="shrink-0 tabular-nums">
                  {p && hasLines ? `Issue invoice · ${money(p.gross)} ${p.currency}` : "Issue invoice…"}
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
                    <th className={`${TH} !text-right`}>Items</th>
                    <th className={`${TH} !text-right`}>Total (CZK)</th>
                    <th className={`${TH} text-left !pl-6 !pr-4`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shownInvoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className={`${TD} text-center !text-slate-500 !py-6`}>
                        {docsLoading
                          ? "Loading the invoices…"
                          : issuedInvoices.length === 0
                            ? "No invoice issued for this job yet."
                            : "No invoices match the search or filter."}
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
                              className={ICON_BTN_GHOST}
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
                                className={`bg-transparent border-0 p-0 ${REF} font-semibold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer disabled:cursor-default disabled:no-underline`}
                              >
                                {d.number}
                              </button>
                            </Tooltip>
                          </td>
                          <td className={`${TD} tabular-nums`}>{czDate(d.issueDate)}</td>
                          <td className={`${TD} text-right tabular-nums`}>{d.lines.length}</td>
                          <td className={`${TD} text-right tabular-nums font-medium`}>{money(Number(d.grossCzk))}</td>
                          <td className={`${TD} !pl-6 !pr-4`}>
                            <Pill tone={status.tone}>{status.label}</Pill>
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={6} className="px-4 py-3 border-b border-slate-100 bg-slate-50/40">
                              <div className={`${CARD} px-3 py-1`}>
                                <table className="w-full border-collapse">
                                  <thead>
                                    <tr>
                                      <th className={`${TH} text-left`}>Service</th>
                                      <th className={`${TH} !text-right w-[8%]`}>Qty</th>
                                      <th className={`${TH} !text-right w-[18%]`}>Price</th>
                                      <th className={`${TH} text-left w-[16%] !pl-6`}>VAT</th>
                                      <th className={`${TH} !text-right w-[18%]`}>Net ({d.currency})</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.lines.map((l, i) => (
                                      <tr key={l.sourceSellingCostId ?? i}>
                                        <td className={TD}>{l.description}</td>
                                        <td className={`${TD} text-right tabular-nums`}>{Number(l.qty)}</td>
                                        <td className={`${TD} text-right tabular-nums`}>
                                          {money(Number(l.unitPrice))} {l.unitCurrency}
                                        </td>
                                        <td className={`${TD} !pl-6`}>{VAT_LABEL[l.vatCode] ?? l.vatCode}</td>
                                        <td className={`${TD} text-right tabular-nums`}>{money(Number(l.net))}</td>
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
                      <td className={`${TD} ${REF} font-medium`}>{d.number}</td>
                      <td className={TD}>
                        <span className="inline-flex gap-2">
                          <Pill tone="slate">{d.kind === "credit_note" ? "Credit note" : "Invoice"}</Pill>
                          {d.status === "credited" && <Pill tone="amber">Credited</Pill>}
                        </span>
                      </td>
                      <td className={`${TD} !text-slate-500`}>{czDate(d.issueDate)}</td>
                      <td className={TD}>{d.customer.companyName}</td>
                      <td className={`${TD} text-right tabular-nums font-medium`}>{money(Number(d.gross))} {d.currency}</td>
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
              <strong className="tabular-nums">{money(p.gross)} {p.currency}</strong>
              {foreign && <> (= {money(p.grossCzk)} CZK)</>}, DUZP {czDate(p.duzp)}, due {czDate(p.dueDate)}.
            </p>
            {notReleasedWarning && <Alert type="warning" showIcon message={notReleasedWarning} />}
            <p className="m-0 text-slate-500">
              It gets the next number of {shipment.jobNumber} and a PDF. An issued invoice can never be changed or deleted —
              a mistake is corrected with a credit note.
            </p>
          </div>
        )}
      </Modal>

      {issuedEmail && (
        <IssuedInvoiceEmailModal
          email={issuedEmail}
          downloading={downloading === issuedEmail.id}
          onDownload={() => void download(issuedEmail)}
          onClose={() => setIssuedEmail(null)}
        />
      )}

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
            Reverses the whole invoice ({creditTarget && <strong className="tabular-nums">{money(Number(creditTarget.doc.gross))} {creditTarget.doc.currency}</strong>}) with the same
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

interface LineTextFieldProps {
  /** The selling row the line is made from; none for a line of no current row. */
  row?: interfaces.SellingCostItem;
  /** The text the line shows now (the preview's, or the row's own). */
  shown: string;
  /** Kept by Trucking: shown as text, as in Costs Breakdown. */
  readOnly: boolean;
  /** An unticked line: greyed, as its other cells. */
  muted: boolean;
  onSave: (sellingId: string, text: string) => Promise<unknown>;
}

/**
 * The text printed on an invoice line, to rewrite before issuing. It starts as the row's
 * Description in Costs Breakdown (else its category); what is typed is kept as the line's own
 * text. Emptied, or set back to that name, the name is printed again and follows the Description.
 */
function LineTextField({ row, shown, readOnly, muted, onSave }: LineTextFieldProps) {
  if (!row || readOnly) return <>{shown}</>;
  return <LineTextInput key={row.id} row={row} muted={muted} onSave={onSave} />;
}

function LineTextInput({ row, muted, onSave }: { row: interfaces.SellingCostItem; muted: boolean; onSave: LineTextFieldProps["onSave"] }) {
  // the name printed when the row has no text of its own (as the server's invoice calculation)
  const fallback = row.description.trim() || chargeLabel(row.category) || "Service";
  const saved = row.customer.trim() || fallback;
  const [value, setValue] = useState(saved);
  const [editing, setEditing] = useState(false);
  // Follows the saved text (a save, another tab) - but never while the user is typing in it.
  const [shownSaved, setShownSaved] = useState(saved);
  if (!editing && saved !== shownSaved) {
    setShownSaved(saved);
    setValue(saved);
  }

  const commit = () => {
    setEditing(false);
    const typed = value.trim();
    if (!typed) setValue(fallback);
    const text = !typed || typed === fallback ? "" : typed;
    // only a real change is saved: a click in and out writes nothing
    if (text === row.customer.trim()) return;
    onSave(row.id, text).catch(() => setValue(saved));
  };

  return (
    <Input
      size="small"
      value={value}
      maxLength={200}
      onFocus={() => setEditing(true)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onPressEnter={(e) => e.currentTarget.blur()}
      aria-label={`Text on the invoice for ${fallback}`}
      className={`!text-[13px] w-full${muted ? " !text-slate-400" : ""}`}
    />
  );
}
