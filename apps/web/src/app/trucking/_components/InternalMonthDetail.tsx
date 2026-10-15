"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Tooltip } from "antd";
import { ArrowLeftOutlined, FileExcelOutlined, FilePdfOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { ConfirmModal } from "@/components/ConfirmModal";
import { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { businessDateTime, businessToday, formatDateTime } from "@/lib/date";
import { downloadDataUrl } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { fetchInternalMonthExport, fetchInternalStatementPdf, useInternalCharges, type InternalCharge, type InternalMonth } from "@/hooks/useTruckingMoney";
import { btnDefault, btnPrimary } from "@/app/warehouse/gate-log/_components/job/fields";
import { consignmentHref } from "../_lib/consignments";
import { TERMS } from "../_lib/glossary";
import { CHARGE_KIND_LABELS, MONTH_STATUS_CHIP, closeMonthState, isNotPriced, monthLabel, monthTotal } from "../_lib/internalBilling";
import { savePdf } from "../_lib/pdfFile";
import { isTruckingManager } from "../_lib/roles";
import { formatMoney, formatQty } from "../_lib/tariffs";
import { fileDataUrl } from "../_lib/tariffUpload";
import { TruckingStatusChip } from "./TruckingStatusChip";

const byText = (a: string, b: string) => a.localeCompare(b, "cs");
const stop = (e: React.MouseEvent) => e.stopPropagation();

const COLUMNS: AppGridColumn<InternalCharge>[] = [
  {
    key: "consignment",
    title: "Consignment",
    text: (c) => c.consignmentRef,
    sorter: (a, b) => byText(a.consignmentRef, b.consignmentRef),
    render: (_, c) => (
      <Link href={consignmentHref(c.consignmentId)} onClick={stop} className="font-mono font-semibold text-indigo-600 hover:underline">
        {c.consignmentRef}
      </Link>
    ),
  },
  {
    key: "job",
    title: "Job no.",
    text: (c) => c.jobNumber,
    sorter: (a, b) => byText(a.jobNumber, b.jobNumber),
    render: (_, c) => (
      <Link href={`/shipments/${c.shipmentId}?tab=trucking`} onClick={stop} className="font-mono text-indigo-600 hover:underline">
        {c.jobNumber}
      </Link>
    ),
  },
  { key: "department", title: "Department", text: (c) => c.department, sorter: (a, b) => byText(a.department, b.department) },
  { key: "delivered", title: "Delivered", text: (c) => businessDateTime(c.deliveredAt), sorter: (a, b) => byText(a.deliveredAt, b.deliveredAt) },
  { key: "kind", title: "Kind", text: (c) => CHARGE_KIND_LABELS[c.kind], filterOptions: Object.values(CHARGE_KIND_LABELS) },
  { key: "level", title: "Service level", text: (c) => c.serviceLevel ?? "" },
  { key: "kg", title: "Chargeable kg", text: (c) => (c.chargeableKg == null ? "" : formatQty(c.chargeableKg)), sorter: (a, b) => (a.chargeableKg ?? 0) - (b.chargeableKg ?? 0) },
  {
    key: "description",
    title: "Description",
    text: (c) => c.description,
    render: (_, c) => <span className={isNotPriced(c) ? "font-semibold text-red-600" : undefined}>{c.description}</span>,
  },
  { key: "amount", title: "Amount CZK", text: (c) => formatMoney(c.amount, c.currency), sorter: (a, b) => a.amount - b.amount },
];

interface InternalMonthDetailProps {
  month: InternalMonth;
}

// One month of internal charges: the charges, those the Internal tariff could not price, and —
// for a manager, once the month is over and everything is priced — Close month into one statement
// per department. Statements (PDF) and the Excel export are downloaded from here.
export const InternalMonthDetail = ({ month }: InternalMonthDetailProps) => {
  const toast = useToast();
  const { user } = useAuth();
  const { charges, isLoading, isError, closeMonth, isClosing } = useInternalCharges(month.month);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const notPriced = charges.filter(isNotPriced);
  const closeState = closeMonthState(month, charges, isTruckingManager(user), businessToday().slice(0, 7));
  const label = monthLabel(month.month);

  const handleClose = async () => {
    try {
      const res = await closeMonth();
      toast.success(`${label} closed — ${res.month.statementNumbers.length} statement${res.month.statementNumbers.length === 1 ? "" : "s"} made`);
      setConfirmOpen(false);
    } catch (e) {
      toast.error(`Could not close ${label}: ${apiErrorMessage(e)}`);
    }
  };
  const handleStatement = async (number: string) => {
    try {
      savePdf(await fetchInternalStatementPdf(number), `${number}.pdf`);
    } catch (e) {
      toast.error(`Could not make statement ${number}: ${apiErrorMessage(e)}`);
    }
  };
  const handleExport = async () => {
    try {
      const file = await fetchInternalMonthExport(month.month);
      downloadDataUrl(fileDataUrl(file), file.fileName || `internal-charges-${month.month}.xlsx`);
    } catch (e) {
      toast.error(`Could not export ${label}: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/trucking?tab=internalBilling" aria-label="All months" className="p-1 text-slate-400 hover:text-indigo-500">
          <ArrowLeftOutlined />
        </Link>
        <h2 className="m-0 text-[18px] font-bold text-slate-800">{label}</h2>
        <TruckingStatusChip chip={MONTH_STATUS_CHIP[month.status]} />
        <span className="text-xs text-slate-500">
          {formatMoney(monthTotal(month), "CZK")}
          {month.closedAt ? ` · closed ${formatDateTime(month.closedAt)}${month.closedBy ? ` by ${month.closedBy}` : ""}` : ""}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {month.statementNumbers.map((n) => (
            <button key={n} type="button" className={btnDefault} onClick={() => handleStatement(n)}>
              <FilePdfOutlined /> {n}
            </button>
          ))}
          <button type="button" className={btnDefault} onClick={handleExport}>
            <FileExcelOutlined /> Excel export
          </button>
          {month.status === "OPEN" && (
            <Tooltip title={closeState.allowed ? undefined : closeState.reason}>
              <span className="inline-flex">
                <button type="button" className={btnPrimary} disabled={!closeState.allowed} onClick={() => setConfirmOpen(true)}>
                  Close month…
                </button>
              </span>
            </Tooltip>
          )}
        </span>
      </div>

      {notPriced.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={`${notPriced.length} charge${notPriced.length === 1 ? " is" : "s are"} not priced`}
          description={`No valid ${TERMS.internalTariff.toLowerCase()} covered ${notPriced.map((c) => c.consignmentRef).join(", ")}. Add or extend the Internal tariff on the Tariffs tab; the month cannot be closed until then.`}
        />
      )}

      <AppGrid<InternalCharge>
        searchPlaceholder="Search consignment, job, department…"
        columns={COLUMNS}
        rows={charges}
        rowKey={(c) => c.id}
        loading={isLoading}
        storageKey="trucking:internal-charges:v1"
        exportFilePrefix={`internal-charges-${month.month}`}
        resetKey={month.month}
        emptyText={isError ? "The charges could not be loaded." : "No internal charges in this month."}
      />

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleClose}
        loading={isClosing}
        title={`Close ${label}?`}
        description={`One ${TERMS.internalStatement.toLowerCase()} per department is made (${month.totals.map((t) => `${t.department} ${formatMoney(t.amount, "CZK")}`).join(", ") || "no charges"}) and the jobs' internal lines get its number. A closed month never changes: later corrections go into the next open month.`}
        confirmLabel="Close month"
      />
    </div>
  );
};
