"use client";

import { Fragment, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Input, Select, Tooltip } from "antd";
import { DownloadOutlined, FileSearchOutlined, SearchOutlined } from "@ant-design/icons";
import { ColumnFiltersPopover } from "@/components/ColumnFiltersPopover";
import { ColumnPickerPopover } from "@/components/ColumnPickerPopover";
import { KPI_GRID_CLASS, KpiTile } from "@/components/KpiTile";
import { SectionBackLink } from "@/components/SectionBackLink";
import { downloadCsv } from "@/lib/csv";
import { businessToday } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { useSupplierInvoices } from "@/hooks/useSupplierInvoices";
import { BTN, BTN_PRIMARY, CARD, CHIP, CHIP_ON, HINT, PAGE_TITLE } from "@/styles/ui";
import { ExpectedTable } from "./ExpectedTable";
import { PayableDrawer } from "./PayableDrawer";
import { PayablesTable } from "./PayablesTable";
import { useTableControls } from "./useTableControls";
import {
  expectedCsv,
  expectedMatches,
  inTab,
  invoicesCsv,
  isPayableTab,
  matchesFilters,
  mergeRows,
  PAYABLE_TABS,
  supplierOptions,
  tabCount,
  type PayableFilters,
  type PayableTab,
} from "../_lib/payables";
import { EXPECTED_TABLE, INVOICE_TABLE, matchesTableFilters } from "../_lib/payableColumns";

// Finance → Accounts Payable (Council Outlay 9, 17 Nov 2026): every invoice received from suppliers, one row per
// invoice (D1), with the statuses Booked, Approved, Refused and Paid and the marks beside them (D3). Everyone reads
// it, with Only my jobs; managers approve, refuse and note it paid in the drawer (D5, D8, D10, D11). The tab and the
// open invoice are kept in the URL (?tab, ?invoice), so Costs Breakdown and the bell can link to an invoice.

type Param = "tab" | "invoice";

function Amounts({ list }: { list: { currency: string; amount: number }[] }) {
  if (!list.length) return <>0</>;
  // One figure per currency, never converted nor added into one total.
  return (
    <>
      {list.map((a) => (
        <div key={a.currency} className="truncate">
          {formatAmount(a.amount, a.currency)}
        </div>
      ))}
    </>
  );
}

export function AccountsPayableView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: PayableTab = isPayableTab(rawTab) ? rawTab : "all";
  const openId = searchParams.get("invoice");

  // As on Invoicing: history.replaceState changes the URL at once (Next keeps useSearchParams in step), each
  // write starting from the URL as it is now.
  const setParams = (patch: Partial<Record<Param, string | null>>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };
  const setTab = (next: PayableTab) => setParams({ tab: next === "all" ? null : next });

  const [filters, setFilters] = useState<PayableFilters>({ search: "", onlyMine: false, supplier: "" });
  const { data, isLoading, isFetching, isError } = useSupplierInvoices();
  // Filter and Columns, as on Invoicing: each table its own, the operator's checks among the filters (the page).
  const invoiceControls = useTableControls(INVOICE_TABLE);
  const expectedControls = useTableControls(EXPECTED_TABLE);
  const controls = tab === "expected" ? expectedControls : invoiceControls;
  const checks = tab === "expected" ? EXPECTED_TABLE.checks : INVOICE_TABLE.checks;

  // Haulier invoices only when the server includes them (superadmins, D17); never with AP actions.
  const hauliers = useMemo(() => (data?.haulier.status === "included" ? data.haulier.invoices : []), [data]);
  const allRows = useMemo(() => mergeRows(data?.invoices ?? [], hauliers), [data, hauliers]);
  const suppliers = useMemo(() => supplierOptions(allRows, data?.expected ?? []), [allRows, data]);
  const invoiceFilters = invoiceControls.filters;
  const expectedFilters = expectedControls.filters;
  const shown = useMemo(
    () => allRows.filter((r) => inTab(r, tab) && matchesFilters(r, filters) && matchesTableFilters(INVOICE_TABLE, r, invoiceFilters)),
    [allRows, tab, filters, invoiceFilters],
  );
  const shownExpected = useMemo(
    () => (data?.expected ?? []).filter((e) => expectedMatches(e, filters) && matchesTableFilters(EXPECTED_TABLE, e, expectedFilters)),
    [data, filters, expectedFilters],
  );

  const filtered = !!filters.search.trim() || filters.onlyMine || !!filters.supplier || controls.filters.length > 0;
  const tabLabel = PAYABLE_TABS.find((t) => t.key === tab)!.label;
  let emptyText = tab === "expected" ? "No estimated cost waiting for an invoice." : tab === "all" ? "No supplier invoice booked yet." : `No invoice ${tabLabel.toLowerCase()}.`;
  if (filtered) emptyText = "Nothing matches these filters.";
  if (isLoading) emptyText = "Loading the invoices…";
  if (isError) emptyText = "Could not load the supplier invoices.";

  // D20: the rows of the tab as they are filtered, the list finance takes to the bank.
  const exportCsv = () => {
    const name = `accounts-payable-${tab.replace("_", "-")}-${businessToday()}.csv`;
    downloadCsv(name, tab === "expected" ? expectedCsv(shownExpected) : invoicesCsv(shown));
  };
  const exportCount = tab === "expected" ? shownExpected.length : shown.length;

  const totals = data?.totals;
  const counts = data?.counts;
  const resetKey = `${tab}|${JSON.stringify(filters)}|${JSON.stringify(controls.filters)}`;

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        {/* Back to the Finance tiles, just above the bar. */}
        <SectionBackLink className="-mb-3 self-start" />
        {/* One bar, as Invoicing's: the title, the counted tabs, then the filters and the actions. */}
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${CARD} px-4 py-3`}>
          <h1 className={PAGE_TITLE}>Accounts Payable</h1>
          <div role="tablist" aria-label="Accounts Payable" className="flex flex-wrap items-center gap-1 self-stretch">
            {PAYABLE_TABS.map((t) => {
              const active = tab === t.key;
              const n = counts ? tabCount(t.key, counts, hauliers) : undefined;
              return (
                <Fragment key={t.key}>
                  {t.dividerBefore && <span aria-hidden className="w-px h-5 bg-slate-200 mx-2" />}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-2 h-full px-2 -mb-px bg-transparent border-0 border-b-2 cursor-pointer text-[13px] whitespace-nowrap transition-colors ${
                      active ? "border-indigo-600 text-indigo-600 font-semibold" : "border-transparent text-slate-500 font-medium hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                    {n !== undefined && (
                      <span className={`rounded-full px-2 text-[11px] font-semibold leading-5 tabular-nums ${active ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>{n}</span>
                    )}
                  </button>
                </Fragment>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 ml-auto">
            {/* antd gives the input width: 100% outside Tailwind's layers, hence the important flag */}
            <Input
              placeholder="Supplier, number, job…"
              aria-label="Search supplier invoices"
              prefix={<SearchOutlined className="text-slate-400" />}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              allowClear
              className="!w-56"
            />
            <Tooltip title="Invoices on jobs you are the Person in Charge or Holiday Cover of">
              <button type="button" aria-pressed={filters.onlyMine} onClick={() => setFilters((f) => ({ ...f, onlyMine: !f.onlyMine }))} className={`${CHIP} ${filters.onlyMine ? CHIP_ON : ""}`}>
                Only my jobs
              </button>
            </Tooltip>
            {/* The operator's checks (the page): rows of the Filter panel, so a saved filter set keeps them. */}
            {checks.map((c) => {
              const on = controls.hasCheck(c.label);
              return (
                <Tooltip key={c.key} title={c.tip}>
                  <button type="button" aria-pressed={on} onClick={() => controls.toggleCheck(c.label)} className={`${CHIP} ${on ? CHIP_ON : ""}`}>
                    {c.label}
                  </button>
                </Tooltip>
              );
            })}
            <Select
              showSearch
              allowClear
              placeholder="Supplier"
              aria-label="Supplier"
              value={filters.supplier || undefined}
              onChange={(v: string | undefined) => setFilters((f) => ({ ...f, supplier: v ?? "" }))}
              options={suppliers}
              optionFilterProp="label"
              popupMatchSelectWidth={280}
              className="!w-48"
            />
            <ColumnFiltersPopover key={`filters-${tab === "expected" ? "expected" : "invoices"}`} {...controls.filterProps} />
            <ColumnPickerPopover key={`columns-${tab === "expected" ? "expected" : "invoices"}`} {...controls.columnProps} />
            <Tooltip title={`Export the ${exportCount} rows shown as CSV`}>
              <button type="button" onClick={exportCsv} disabled={!data || exportCount === 0} className={BTN}>
                <DownloadOutlined />
                Export
              </button>
            </Tooltip>
            {/* No second entry form here: an invoice is read on Document / Text Reading, Supplier invoice chosen (the page). */}
            <button type="button" onClick={() => router.push("/documents?destination=invoicing")} className={BTN_PRIMARY}>
              <FileSearchOutlined />
              Read an invoice
            </button>
          </div>
        </div>

        {/* The tiles are filters too: each opens its tab. Per currency, without VAT, never converted. */}
        <div className={KPI_GRID_CLASS}>
          <KpiTile
            label="To pay"
            value={totals ? <Amounts list={totals.toPay} /> : "—"}
            hint={counts ? `${counts.toPay} approved · without VAT` : undefined}
            onClick={() => setTab("to_pay")}
          />
          <KpiTile
            label="Overdue"
            value={counts ? counts.overdue : "—"}
            tone={counts && counts.overdue > 0 ? "red" : undefined}
            hint={totals?.overdue.length ? totals.overdue.map((a) => formatAmount(a.amount, a.currency)).join(" · ") : "none overdue"}
            hintTone={totals?.overdue.length ? "red" : undefined}
            onClick={() => setTab("overdue")}
          />
          {/* Booked or approved, due today or in the next 7 days: no tab of its own. */}
          <KpiTile label="Due this week" value={data ? data.dueThisWeek : "—"} hint="due in the next 7 days" />
          <KpiTile
            label="To approve"
            value={counts ? counts.toApprove : "—"}
            tone={counts && counts.toApprove > 0 ? "amber" : undefined}
            hint={data?.canDecide ? "waiting for your approval" : "waiting for a manager"}
            onClick={() => setTab("to_approve")}
          />
          <KpiTile
            label="Expected"
            value={totals ? <Amounts list={totals.expected} /> : "—"}
            hint={counts ? `${counts.expected} estimates, no invoice yet` : undefined}
            onClick={() => setTab("expected")}
          />
          {/* An open claim holds the invoice's payment until it is settled or withdrawn (D15). */}
          <KpiTile
            label="Claimed"
            value={counts ? counts.claimed : "—"}
            tone={counts && counts.claimed > 0 ? "red" : undefined}
            hint="open claims, payment held"
            onClick={() => setTab("claimed")}
          />
        </div>

        {isError && <Alert type="error" showIcon message="Could not load the supplier invoices." />}
        {data?.truncated && tab !== "expected" && (
          <Alert type="info" showIcon message={`The list holds the newest ${data.invoices.length.toLocaleString("en-US")} supplier invoices: the oldest are left out, and the counts and totals cover only these.`} />
        )}
        {data?.haulier.truncated && tab !== "expected" && <Alert type="info" showIcon message="Only the newest haulier invoices from Trucking are listed: the oldest are left out." />}
        {data?.haulier.status === "unavailable" && tab !== "expected" && (
          <Alert type="warning" showIcon message="Trucking's haulier invoices could not be read just now: they are not in the list. Open the page again in a moment." />
        )}

        {tab === "expected" ? (
          <ExpectedTable rows={data && !isError ? shownExpected : undefined} loading={isFetching && !data} emptyText={emptyText} resetKey={resetKey} visible={expectedControls.visible} />
        ) : (
          <PayablesTable rows={data && !isError ? shown : undefined} loading={isFetching && !data} emptyText={emptyText} resetKey={resetKey} visible={invoiceControls.visible} onOpen={(id) => setParams({ invoice: id })} />
        )}

        {/* What the list leaves out, said so nobody takes a missing invoice for one that does not exist. */}
        <div className={HINT}>
          Amounts are without VAT, per currency, as the invoices bill the jobs.
          {data?.haulier.status === "hidden" && " Haulier invoices from Trucking are not included: they are kept in Trucking, shown here to superadmins only while Trucking is a concept."}
          {data?.haulier.status === "included" && " Haulier invoices from Trucking are listed with their own status and amount with VAT, and never added to the totals; they are approved and paid in Trucking."}
        </div>

        <PayableDrawer id={openId} onClose={() => setParams({ invoice: null })} />
      </div>
    </div>
  );
}
