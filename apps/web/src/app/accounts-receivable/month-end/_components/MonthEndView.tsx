"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import dayjs from "dayjs";
import { Alert, DatePicker, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { DataTable } from "@/components/DataTable";
import { KPI_GRID_CLASS, KpiTile } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { useReceivablesAsAt, type ReceivableAsAtRow } from "@/hooks/useReceivableTools";
import { arInvoiceHref } from "@/lib/accountsReceivable";
import { apiErrorMessage } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { businessToday, formatDate } from "@/lib/date";
import { replaceSearchParams } from "@/lib/urlParams";
import { BTN, CARD, EMPTY, HINT, LABEL_TEXT, LINK, PAGE_TITLE, REF } from "@/styles/ui";
import { amountText } from "../../_lib/receivables";
import { CZK_TOTAL_LABEL, defaultMonthEndDay, monthEndCsv, monthEndDayOf, monthEndFileName, TAKEN_BACK_RULE, typedDayProblem } from "../_lib/monthEnd";

// Finance → Accounts Receivable → Month-end (step 7): what customers owed at the end of a day - every invoice issued
// on or before it, not cancelled, with something left to pay then. Per invoice in its own currency and in CZK at the
// invoice's own rate (ČNB on its tax date); totals per currency, and one CZK total. Revaluation stays in accounting.

const none = <span className={EMPTY}>—</span>;
const money = (v: number, currency: string, strong = false) => <span className={`tabular-nums whitespace-nowrap ${strong ? "font-semibold text-slate-900" : ""}`}>{amountText(v, currency)}</span>;
const cmp = (a: string, b: string) => a.localeCompare(b);

const CARRIED_TIP = "A payment carried over from the customer's list counts here: it was paid before Accounts Receivable, on a day not known, so it counts on every day";

const columns: ColumnsType<ReceivableAsAtRow> = [
  {
    title: "Invoice number",
    key: "number",
    sorter: (a, b) => cmp(a.number, b.number),
    render: (_, r) => (
      <Link href={arInvoiceHref(r.invoiceId)} className={`${REF} ${LINK} font-semibold whitespace-nowrap`}>
        {r.number || "—"}
      </Link>
    ),
  },
  {
    title: "Customer",
    key: "customer",
    sorter: (a, b) => cmp(a.customer, b.customer),
    render: (_, r) => (
      <span className="block max-w-[240px] truncate font-medium text-slate-900" title={r.customer}>
        {r.customer || "—"}
      </span>
    ),
  },
  { title: "Job", key: "job", sorter: (a, b) => cmp(a.jobNumber, b.jobNumber), render: (_, r) => <span className={REF}>{r.jobNumber || "—"}</span> },
  { title: "Issued", key: "issued", sorter: (a, b) => cmp(a.issueDate, b.issueDate), render: (_, r) => <span className="tabular-nums whitespace-nowrap">{formatDate(r.issueDate)}</span> },
  {
    title: "Due",
    key: "due",
    sorter: (a, b) => cmp(a.dueDate, b.dueDate),
    render: (_, r) => (
      <div className="whitespace-nowrap">
        <span className="tabular-nums">{formatDate(r.dueDate)}</span>
        {r.daysOverdue > 0 && (
          <div className="text-[11px] font-medium text-red-600">
            {r.daysOverdue} {r.daysOverdue === 1 ? "day" : "days"} overdue that day
          </div>
        )}
      </div>
    ),
  },
  { title: "Amount with VAT", key: "gross", align: "right", sorter: (a, b) => a.gross - b.gross, render: (_, r) => money(r.gross, r.currency) },
  { title: "Credited", key: "credited", align: "right", render: (_, r) => (r.credited ? money(r.credited, r.currency) : none) },
  { title: "Paid", key: "paid", align: "right", render: (_, r) => (r.paid ? money(r.paid, r.currency) : none) },
  { title: "Written off", key: "writtenOff", align: "right", render: (_, r) => (r.writtenOff ? money(r.writtenOff, r.currency) : none) },
  { title: "Left to pay", key: "left", align: "right", sorter: (a, b) => a.leftToPay - b.leftToPay, render: (_, r) => money(r.leftToPay, r.currency, true) },
  {
    title: "Rate",
    key: "rate",
    align: "right",
    render: (_, r) => (
      <Tooltip title={`CZK per 1 ${r.currency}: the invoice's own ČNB rate, of its tax date`}>
        <span className="tabular-nums">{String(r.fxRate)}</span>
      </Tooltip>
    ),
  },
  { title: "Left to pay in CZK", key: "czk", align: "right", sorter: (a, b) => a.leftToPayCzk - b.leftToPayCzk, render: (_, r) => money(r.leftToPayCzk, "CZK") },
  {
    title: "Note",
    key: "note",
    render: (_, r) =>
      r.carriedOver ? (
        <Tooltip title={CARRIED_TIP}>
          <Pill tone="slate">Paid before Accounts Receivable, day not known</Pill>
        </Tooltip>
      ) : (
        none
      ),
  },
];

export function MonthEndView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = businessToday();
  const day = monthEndDayOf(searchParams.get("day"), today);
  // A day after today typed into the field: it isn't taken, and that is said (user council A9).
  const [dayProblem, setDayProblem] = useState("");
  const setDay = (next: string) => {
    setDayProblem("");
    replaceSearchParams(pathname, { day: next === defaultMonthEndDay(today) ? null : next });
  };
  const checkTyped = (e: { target: EventTarget | null }) => {
    const typed = e.target instanceof HTMLInputElement ? e.target.value : "";
    setDayProblem(typedDayProblem(typed, today));
  };

  const query = useReceivablesAsAt(day);
  const data = query.data;
  const failed = query.isError && !data;
  const carried = data?.rows.filter((r) => r.carriedOver).length ?? 0;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(monthEndFileName(data.day), monthEndCsv(data.day, data.rows, data.totals, data.totalCzk));
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <BackLink href="/accounts-receivable" className="-mb-3 self-start">
          Accounts Receivable
        </BackLink>
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${CARD} px-4 py-3`}>
          <h1 className={PAGE_TITLE}>Month-end</h1>
          <div className="flex flex-wrap items-center justify-end gap-3 ml-auto">
            <label className="flex items-center gap-2">
              <span className={LABEL_TEXT}>Owed at the end of</span>
              <DatePicker
                allowClear={false}
                format="D.M.YYYY"
                value={dayjs(day)}
                disabledDate={(d) => d.format("YYYY-MM-DD") > today}
                onChange={(d) => d && setDay(d.format("YYYY-MM-DD"))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") checkTyped(e);
                }}
                onBlur={checkTyped}
                status={dayProblem ? "warning" : undefined}
                aria-label="The day"
                aria-describedby={dayProblem ? "month-end-day-problem" : undefined}
              />
              {dayProblem && (
                <span id="month-end-day-problem" role="status" className="text-[12px] text-amber-700">
                  {dayProblem}
                </span>
              )}
            </label>
            <button type="button" onClick={() => setDay(defaultMonthEndDay(today))} className={BTN} disabled={day === defaultMonthEndDay(today)}>
              Last month-end
            </button>
            <Tooltip title={data ? `Export the ${data.rows.length} invoices with the totals as CSV` : undefined}>
              <button type="button" onClick={exportCsv} disabled={!data || query.isFetching} className={BTN}>
                <DownloadOutlined />
                Export
              </button>
            </Tooltip>
          </div>
        </div>

        <div className={KPI_GRID_CLASS}>
          {(data?.totals.length ? data.totals : [null]).map((t) => (
            <KpiTile
              key={t?.currency ?? "none"}
              label={t ? `Owed · ${t.currency} · with VAT` : "Owed · with VAT"}
              value={!data ? "—" : t ? amountText(t.amount, t.currency) : "0"}
              hint={t ? `${data?.rows.filter((r) => r.currency === t.currency).length ?? 0} invoices, in ${t.currency} as invoiced` : undefined}
            />
          ))}
          <KpiTile wrapLabel label="Owed in CZK" value={data ? amountText(data.totalCzk, "CZK") : "—"} hint={CZK_TOTAL_LABEL} />
        </div>

        <div className={HINT}>
          What customers owed at the end of {formatDate(day)}: every invoice issued on or before that day and not cancelled, less the credit notes issued by then, the
          payments paid by then and the write-offs and bank charges confirmed by then. Amounts are with VAT in each invoice&apos;s own currency; the CZK figures use each
          invoice&apos;s own ČNB rate (of its tax date), not the rate of the day - revaluation stays in accounting. The one total across currencies is the CZK one.{" "}
          {TAKEN_BACK_RULE}
          {carried > 0 &&
            ` ${carried} ${carried === 1 ? "invoice counts" : "invoices count"} a payment carried over from the customer's list: it was paid before Accounts Receivable, on a day not known, so it counts on every day.`}
        </div>

        {failed && <Alert type="error" showIcon message={`Could not load the month-end: ${apiErrorMessage(query.error)}`} />}
        {!!data?.unchecked && (
          <Alert
            type="warning"
            showIcon
            message={
              data.uncheckedNote ||
              `${data.unchecked} ${data.unchecked === 1 ? "invoice" : "invoices"} could not be checked against the customer's list: ${data.unchecked === 1 ? "it" : "they"} may already be paid, so the totals may be too high. Open the page again in a moment.`
            }
          />
        )}
        {data?.truncated && (
          <Alert
            type="warning"
            showIcon
            message={`The list is not complete: more invoices were issued by ${formatDate(day)} than are read at once, so some are left out and the totals cover only those listed: they are not the month-end's figures.`}
          />
        )}

        <DataTable<ReceivableAsAtRow>
          resizeKey="accounts-receivable:month-end"
          dataSource={failed ? undefined : data?.rows}
          columns={columns}
          rowKey="invoiceId"
          loading={query.isFetching && !data}
          scroll={{ x: "max-content" }}
          resetKey={day}
          locale={{ emptyText: query.isLoading ? "Loading…" : failed ? "Could not load the month-end" : `Nothing was owed at the end of ${formatDate(day)}` }}
        />
      </div>
    </div>
  );
}
