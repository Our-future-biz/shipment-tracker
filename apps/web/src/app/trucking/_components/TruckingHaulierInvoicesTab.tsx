"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useCreateHaulierInvoice, useHaulierInvoices, type HaulierInvoice, type HaulierInvoiceStatus } from "@/hooks/useTruckingMoney";
import { INVOICE_STATUS_CHIP, INVOICE_STATUS_ORDER, differenceText, haulierInvoiceHref } from "../_lib/haulierInvoices";
import { formatMoney } from "../_lib/tariffs";
import { HaulierInvoiceEntryModal } from "../haulier-invoices/_components/HaulierInvoiceEntryModal";
import { TruckingStatusChip } from "./TruckingStatusChip";
import { byText, dash, pragueDate } from "../_lib/format";


const COLUMNS: AppGridColumn<HaulierInvoice>[] = [
  {
    key: "number",
    title: "Invoice no.",
    text: (i) => i.invoiceNumber,
    sorter: (a, b) => byText(a.invoiceNumber, b.invoiceNumber),
    render: (_, i) => (
      <Link href={haulierInvoiceHref(i.id)} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold text-indigo-600 hover:underline">
        {i.invoiceNumber}
      </Link>
    ),
  },
  { key: "haulier", title: "Haulier", text: (i) => i.haulierName, sorter: (a, b) => byText(a.haulierName, b.haulierName) },
  {
    key: "status",
    title: "Status",
    text: (i) => INVOICE_STATUS_CHIP[i.status].label,
    filterOptions: INVOICE_STATUS_ORDER.map((s) => INVOICE_STATUS_CHIP[s].label),
    sorter: (a, b) => INVOICE_STATUS_ORDER.indexOf(a.status) - INVOICE_STATUS_ORDER.indexOf(b.status),
    render: (_, i) =>
      i.status === "BLOCKED" && i.blockReasons.length ? (
        <Tooltip title={i.blockReasons.join(" · ")}>
          <span className="inline-flex flex-col gap-0.5">
            <TruckingStatusChip chip={INVOICE_STATUS_CHIP[i.status]} />
            <span className="max-w-[260px] truncate text-[11px] text-red-600">{i.blockReasons.join(" · ")}</span>
          </span>
        </Tooltip>
      ) : (
        <TruckingStatusChip chip={INVOICE_STATUS_CHIP[i.status]} />
      ),
  },
  { key: "issue", title: "Issued", text: (i) => formatDate(i.issueDate), sorter: (a, b) => byText(a.issueDate, b.issueDate) },
  { key: "due", title: "Due", text: (i) => formatDate(i.dueDate), sorter: (a, b) => byText(a.dueDate ?? "9999", b.dueDate ?? "9999"), render: (_, i) => formatDate(i.dueDate) || dash },
  { key: "net", title: "Net", text: (i) => formatMoney(i.totalNet, i.currency), sorter: (a, b) => a.totalNet - b.totalNet },
  { key: "gross", title: "Gross", text: (i) => formatMoney(i.totalGross, i.currency), sorter: (a, b) => a.totalGross - b.totalGross, defaultVisible: false },
  {
    key: "difference",
    title: "Difference",
    text: (i) => differenceText(i.difference, i.currency),
    sorter: (a, b) => Math.abs(a.difference) - Math.abs(b.difference),
    render: (_, i) => <span className={i.difference ? "font-semibold text-amber-700" : "text-emerald-700"}>{differenceText(i.difference, i.currency)}</span>,
  },
  { key: "lines", title: "Lines", text: (i) => i.lines.map((l) => l.target.ref).join(", "), render: (_, i) => <span className="font-mono">{i.lines.map((l) => l.target.ref).join(", ")}</span> },
  { key: "created", title: "Entered", text: (i) => `${pragueDate(i.createdAt)}${i.createdBy ? ` · ${i.createdBy}` : ""}`, sorter: (a, b) => byText(a.createdAt, b.createdAt) },
];

// The invoices hauliers sent us, matched against their trips and partner deliveries. Status chips
// filter (?status=); Enter invoice opens the entry dialog; a row opens the invoice.
export const TruckingHaulierInvoicesTab = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { invoices, isLoading, isError } = useHaulierInvoices();
  const { create } = useCreateHaulierInvoice();
  const [entryOpen, setEntryOpen] = useState(false);
  const status = INVOICE_STATUS_ORDER.find((s) => s === searchParams.get("status")) ?? null;

  const counts = useMemo(() => {
    const out = Object.fromEntries(INVOICE_STATUS_ORDER.map((s) => [s, 0])) as Record<HaulierInvoiceStatus, number>;
    for (const i of invoices) out[i.status] += 1;
    return out;
  }, [invoices]);
  const rows = useMemo(() => (status ? invoices.filter((i) => i.status === status) : invoices), [invoices, status]);

  const handleStatus = (next: HaulierInvoiceStatus | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("status", next);
    else params.delete("status");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <AppGrid<HaulierInvoice>
        subHeader={
          <div role="group" aria-label="Status filters" className="mt-3 flex flex-wrap gap-2">
            {INVOICE_STATUS_ORDER.map((s) => {
              const on = status === s;
              const chip = INVOICE_STATUS_CHIP[s];
              const danger = (s === "BLOCKED" || s === "NEEDS_APPROVAL") && counts[s] > 0;
              return (
                <Tooltip key={s} title={chip.hint} mouseEnterDelay={0.4}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => handleStatus(on ? null : s)}
                    className={[
                      "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                      on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {chip.label}
                    <span className={`tabular-nums font-semibold ${danger ? "text-red-600" : on ? "text-indigo-700" : "text-slate-500"}`}>{isLoading ? "—" : counts[s]}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        }
        searchPlaceholder="Search invoice, haulier, trip…"
        columns={COLUMNS}
        rows={rows}
        rowKey={(i) => i.id}
        loading={isLoading}
        onRowClick={(i) => router.push(haulierInvoiceHref(i.id))}
        storageKey="trucking:haulier-invoices:v1"
        exportFilePrefix="haulier-invoices"
        resetKey={status ?? ""}
        emptyText={isError ? "The haulier invoices could not be loaded." : status ? "No invoices with this status." : "No haulier invoices yet. Enter one when it arrives."}
        actions={
          <Tooltip title="Enter an invoice a haulier sent: tick its trips and partner deliveries, type the amounts — any difference waits for a manager">
            <button
              type="button"
              onClick={() => setEntryOpen(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              <PlusOutlined />
              Enter invoice
            </button>
          </Tooltip>
        }
      />
      {entryOpen && (
        <HaulierInvoiceEntryModal
          onClose={() => setEntryOpen(false)}
          onCreate={(req) =>
            create(req).then((res) => {
              toast.success(`Invoice ${res.invoice.invoiceNumber} saved — ${INVOICE_STATUS_CHIP[res.invoice.status].label}`);
              router.push(haulierInvoiceHref(res.invoice.id));
            })
          }
        />
      )}
    </>
  );
};
