"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Input, Select, Tooltip } from "antd";
import { DollarOutlined, DownloadOutlined, FileAddOutlined, SearchOutlined } from "@ant-design/icons";
import { ColumnFiltersPopover } from "@/components/ColumnFiltersPopover";
import { ColumnPickerPopover } from "@/components/ColumnPickerPopover";
import { Amounts } from "@/components/finance/Amounts";
import { CountedTabs } from "@/components/finance/CountedTabs";
import { KPI_GRID_CLASS, KpiTile } from "@/components/KpiTile";
import { SectionBackLink } from "@/components/SectionBackLink";
import { useReceivables } from "@/hooks/useReceivables";
import { useTableControls } from "@/hooks/useTableControls";
import { downloadCsv } from "@/lib/csv";
import { businessToday } from "@/lib/date";
import { useLatestRates } from "@/lib/fx";
import { formatAmount } from "@/lib/money";
import { matchesTableFilters } from "@/lib/tableModel";
import { replaceSearchParams } from "@/lib/urlParams";
import { BTN, BTN_PRIMARY, CARD, CHIP, CHIP_ON, HINT, PAGE_TITLE } from "@/styles/ui";
import { BatchPaymentDialog } from "./BatchPaymentDialog";
import { CustomersTable } from "./CustomersTable";
import { ReceivableDrawer } from "./ReceivableDrawer";
import { ReceivablesTable } from "./ReceivablesTable";
import { ReceivableTools } from "./ReceivableTools";
import {
  BATCH_TABS,
  checkLabel,
  customerMatches,
  customerOptions,
  customersCsv,
  DEFAULT_TAB,
  emptyText,
  inTab,
  isFiltered,
  isPeriod,
  isReceivableTab,
  limitStates,
  matchesFilters,
  myCustomerIdsOf,
  NO_FILTERS,
  PERIOD_FREE_TABS,
  PERIOD_OPTIONS,
  periodWords,
  frozenBatchRows,
  prunedSelection,
  RECEIVABLE_CHECKS,
  receivablesCsv,
  tabCount,
  tileCheckToggles,
  visibleTabs,
  type ReceivableCheck,
  type ReceivableFilters,
  type ReceivablePeriod,
  type ReceivableRow,
  type ReceivableTab,
} from "../_lib/receivables";
import { CUSTOMER_CHECKS, CUSTOMER_TABLE, customerRowsOf, receivableTable } from "../_lib/receivableColumns";

// Finance → Accounts Receivable (Council Outlay 10, 18 Nov 2026): what customers owe, one row per issued invoice with its
// credit notes folded in (D1), read from the issued invoices (D8), with the words Unpaid, Part paid, Paid, Credited and
// Cancelled and the marks beside them (D3). Everyone reads it, with My jobs and My customers; managers note payments and
// take them back in the drawer (D5, D11). The tab, the period and the open invoice are kept in the URL (?tab, ?period,
// ?invoice), so the customer's page, the job and the bell can link to an invoice (arInvoiceHref). Step 7: a manager
// ticks invoices in Unpaid or Overdue and notes one bank payment over them; By customer has each customer's statement;
// Tools leads to the bank statements, month-end, the Pohoda export and the settings.

type Param = "tab" | "invoice" | "period";

export function AccountsReceivableView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: ReceivableTab = isReceivableTab(rawTab) ? rawTab : DEFAULT_TAB;
  const rawPeriod = searchParams.get("period");
  const period: ReceivablePeriod = isPeriod(rawPeriod) ? rawPeriod : "90d";
  const openId = searchParams.get("invoice");

  // As on Accounts Payable: history.replaceState changes the URL at once, each write starting from the URL as it is now.
  const setParams = (patch: Partial<Record<Param, string | null>>) => replaceSearchParams(pathname, patch);
  const setTab = (next: ReceivableTab) => setParams({ tab: next === DEFAULT_TAB ? null : next });

  const [filters, setFilters] = useState<ReceivableFilters>(NO_FILTERS);
  // The invoices ticked for one payment, kept with the tab they were ticked on: another tab starts with none.
  const [ticked, setTicked] = useState<{ tab: ReceivableTab; keys: string[] }>({ tab: DEFAULT_TAB, keys: [] });
  // The batch dialog's invoices, frozen when it opens (null: closed). The dialog renders from them, never from the
  // selection, so a list read again meanwhile changes nothing it sends; there is no open flag left behind to bring
  // it back by itself when invoices are ticked again.
  const [batchRows, setBatchRows] = useState<ReceivableRow[] | null>(null);
  const { data, isLoading, isFetching, isError } = useReceivables(period);
  const { rates, fixingLabel } = useLatestRates();

  // The server's day (Prague), so "due this week" matches the tile; the browser's Prague day until it is in.
  const today = data?.today ?? businessToday();
  const invoiceTable = useMemo(() => receivableTable(today), [today]);
  const invoiceControls = useTableControls(invoiceTable);
  const customerControls = useTableControls(CUSTOMER_TABLE);
  const byCustomer = tab === "customers";
  const controls = byCustomer ? customerControls : invoiceControls;
  const checks = byCustomer ? CUSTOMER_CHECKS : RECEIVABLE_CHECKS;

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const customers = useMemo(() => customerOptions(rows, data?.byCustomer ?? []), [rows, data]);
  const myCustomerIds = useMemo(() => myCustomerIdsOf(rows), [rows]);
  // The one converted figure on the page (the Rules, "Amounts"): what a customer owes against its credit limit.
  const limits = useMemo(() => limitStates(data?.byCustomer ?? [], rates), [data, rates]);
  const customerRows = useMemo(() => customerRowsOf(data?.byCustomer ?? [], limits), [data, limits]);

  const invoiceFilters = invoiceControls.filters;
  const customerFilters = customerControls.filters;
  const shown = useMemo(
    () => rows.filter((r) => inTab(r, tab) && matchesFilters(r, filters) && matchesTableFilters(invoiceTable, r, invoiceFilters)),
    [rows, tab, filters, invoiceTable, invoiceFilters],
  );
  const shownCustomers = useMemo(
    () => customerRows.filter((c) => customerMatches(c, filters, myCustomerIds) && matchesTableFilters(CUSTOMER_TABLE, c, customerFilters)),
    [customerRows, filters, myCustomerIds, customerFilters],
  );

  // One payment over several invoices: managers, on the tabs of what is owed (step 7). A ticked invoice paid or gone
  // meanwhile drops out.
  const canBatch = !!data?.canAct && BATCH_TABS.includes(tab);
  const selectedIds = useMemo(() => (canBatch && ticked.tab === tab ? prunedSelection(ticked.keys, rows) : []), [canBatch, ticked, tab, rows]);
  const selectedRows = useMemo(() => {
    const by = new Map(rows.map((r) => [r.id, r]));
    return selectedIds.map((id) => by.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  }, [rows, selectedIds]);

  const filtered = isFiltered(filters) || controls.filters.length > 0;
  const empty = emptyText({ tab, period, filtered, loading: isLoading, failed: isError });

  // D26: the filtered list as CSV, one line per document; By customer as it is shown.
  const exportCsv = () => {
    const name = `accounts-receivable-${tab}-${businessToday()}.csv`;
    downloadCsv(name, byCustomer ? customersCsv(shownCustomers, limits) : receivablesCsv(shown));
  };
  const exportCount = byCustomer ? shownCustomers.length : shown.length;

  // A tile that is a filter: it opens its tab, puts on the check it stands for (never taken off by a second click) and
  // takes off another tile's, so the table lists what the tile counts.
  const openTile = (next: ReceivableTab, own: ReceivableCheck | null = null) => {
    setTab(next);
    for (const check of tileCheckToggles((c) => invoiceControls.hasCheck(checkLabel(c)), own)) invoiceControls.toggleCheck(checkLabel(check));
  };

  const totals = data?.totals;
  const counts = data?.counts;
  const resetKey = `${tab}|${period}|${JSON.stringify(filters)}|${JSON.stringify(controls.filters)}`;
  const periodApplies = !PERIOD_FREE_TABS.includes(tab);

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        {/* Back to the Finance tiles, just above the bar. */}
        <SectionBackLink className="-mb-3 self-start" />
        {/* One bar, as Invoicing's and Accounts Payable's: the title, the counted tabs, then the filters and the actions. */}
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${CARD} px-4 py-3`}>
          <h1 className={PAGE_TITLE}>Accounts Receivable</h1>
          <CountedTabs
            ariaLabel="Accounts Receivable"
            tabs={visibleTabs(counts, tab).map((t) => ({ key: t.key, label: t.label, count: counts ? tabCount(t.key, counts) : undefined, dividerBefore: t.dividerBefore }))}
            active={tab}
            onChange={setTab}
          />
          <div className="flex flex-wrap items-center justify-end gap-3 ml-auto">
            {/* antd gives the input width: 100% outside Tailwind's layers, hence the important flag */}
            <Input
              placeholder="Customer, number, job, credit note…"
              aria-label="Search customer invoices"
              prefix={<SearchOutlined className="text-slate-400" />}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              allowClear
              className="!w-64"
            />
            <Tooltip title={byCustomer ? "Invoices on jobs you are the Person in Charge or Holiday Cover of: it narrows the invoice tabs, not By customer" : "Invoices on jobs you are the Person in Charge or Holiday Cover of"}>
              <button type="button" aria-pressed={filters.mine} onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))} className={`${CHIP} ${filters.mine ? CHIP_ON : ""}`}>
                My jobs
              </button>
            </Tooltip>
            <Tooltip title="Invoices to customers you are the Sales Owner of">
              <button type="button" aria-pressed={filters.myCustomers} onClick={() => setFilters((f) => ({ ...f, myCustomers: !f.myCustomers }))} className={`${CHIP} ${filters.myCustomers ? CHIP_ON : ""}`}>
                My customers
              </button>
            </Tooltip>
            {/* The operator's checks: rows of the Filter panel, so a saved filter set keeps them. */}
            {checks.map((c) => {
              const active = controls.hasCheck(c.label);
              return (
                <Tooltip key={c.key} title={c.tip}>
                  <button type="button" aria-pressed={active} onClick={() => controls.toggleCheck(c.label)} className={`${CHIP} ${active ? CHIP_ON : ""}`}>
                    {c.label}
                  </button>
                </Tooltip>
              );
            })}
            <Select
              showSearch
              allowClear
              placeholder="Customer"
              aria-label="Customer"
              value={filters.customerId || undefined}
              onChange={(v: string | undefined) => setFilters((f) => ({ ...f, customerId: v ?? "" }))}
              options={customers}
              optionFilterProp="label"
              popupMatchSelectWidth={300}
              className="!w-48"
            />
            {/* Unpaid and Overdue always list everything owed: the period reaches only the invoices no longer owed. */}
            <Tooltip title={periodApplies ? "Which paid, credited and cancelled invoices are listed, by the day they were issued. Every unpaid invoice is always listed." : "Unpaid and overdue invoices are all listed, whatever their age: the period reaches the paid, credited and cancelled ones."}>
              <Select
                aria-label="Period"
                value={period}
                onChange={(v: ReceivablePeriod) => setParams({ period: v === "90d" ? null : v })}
                options={PERIOD_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                popupMatchSelectWidth={180}
                className="!w-36"
              />
            </Tooltip>
            <ColumnFiltersPopover key={`filters-${byCustomer ? "customers" : "invoices"}`} {...controls.filterProps} />
            {/* "Select all" shows every column, the optional ones too. */}
            <ColumnPickerPopover
              key={`columns-${byCustomer ? "customers" : "invoices"}`}
              {...controls.columnProps}
              allKeys={(byCustomer ? CUSTOMER_TABLE : invoiceTable).columns.map((c) => c.key)}
            />
            <Tooltip title={byCustomer ? `Export the ${exportCount} rows shown as CSV` : `Export the ${exportCount} invoices shown as CSV, one line per document: each credit note on a line of its own`}>
              <button type="button" onClick={exportCsv} disabled={!data || isError || exportCount === 0} className={BTN}>
                <DownloadOutlined />
                Export
              </button>
            </Tooltip>
            {/* Bank statements, month-end, the Pohoda export and the settings (step 7). */}
            <ReceivableTools canAct={!!data?.canAct} />
            {canBatch && (
              <Tooltip title={selectedIds.length ? `Note one bank payment over the ${selectedIds.length} ticked ${selectedIds.length === 1 ? "invoice" : "invoices"}` : "Tick the invoices one bank payment pays, then note it once"}>
                <span className="inline-flex">
                  <button type="button" onClick={() => {
                      if (selectedRows.length) setBatchRows(frozenBatchRows(selectedRows));
                    }} disabled={!selectedRows.length} className={BTN}>
                    <DollarOutlined />
                    Note one payment…{selectedIds.length ? ` (${selectedIds.length})` : ""}
                  </button>
                </span>
              </Tooltip>
            )}
            {/* No second way to issue here: Invoicing issues invoices and credit notes (the page). */}
            <button type="button" onClick={() => router.push("/invoicing")} className={BTN_PRIMARY}>
              <FileAddOutlined />
              Issue an invoice
            </button>
          </div>
        </div>

        {/* The tiles are filters too: each opens its tab. Per currency, with VAT, never converted nor one grand total (D6, D7). */}
        <div className={KPI_GRID_CLASS}>
          {(totals?.toCollect.length ? totals.toCollect : [null]).map((a) => {
            const overdue = a ? totals?.overdue.find((o) => o.currency === a.currency) : undefined;
            return (
              <KpiTile
                key={a?.currency ?? "none"}
                label={a ? `To collect · ${a.currency} · with VAT` : "To collect · with VAT"}
                value={!totals ? "—" : a ? formatAmount(a.amount, a.currency) : <Amounts list={[]} />}
                hint={overdue ? `${formatAmount(overdue.amount, overdue.currency)} overdue` : totals ? "none overdue" : undefined}
                hintTone={overdue ? "red" : undefined}
                onClick={() => openTile("unpaid")}
              />
            );
          })}
          <KpiTile
            label="Overdue"
            value={counts ? counts.overdue : "—"}
            tone={counts && counts.overdue > 0 ? "red" : undefined}
            hint={counts ? (counts.overdue === 1 ? "invoice" : "invoices") : undefined}
            onClick={() => openTile("overdue")}
          />
          <KpiTile
            label="Due this week"
            value={data ? data.dueThisWeek : "—"}
            hint={data ? `${data.dueThisWeek === 1 ? "invoice" : "invoices"} · due in the next 7 days` : undefined}
            onClick={() => openTile("unpaid", "due_week")}
          />
          <KpiTile
            label="Over 60 days"
            value={data ? data.over60 : "—"}
            tone={data && data.over60 > 0 ? "red" : undefined}
            hint={data ? `${data.over60 === 1 ? "invoice" : "invoices"} · more than 60 days overdue` : undefined}
            onClick={() => openTile("overdue", "over_60")}
          />
          <KpiTile label="Customers owing" value={data ? data.customersOwing : "—"} hint="opens By customer" onClick={() => setTab("customers")} />
        </div>

        {/* What the list leaves out, said so nobody takes a missing invoice for one that does not exist. */}
        <div className={HINT}>
          Amounts are with VAT, per currency, as invoiced; never converted. A payment is noted by a manager, by hand or from a bank statement read in Tools. Invoices not issued in Invoicing
          (customs numbers typed by hand, rows typed on a customer) are not listed.
          {periodApplies && ` Paid, credited and cancelled invoices are listed when ${periodWords(period)}.`}
          {byCustomer && ` "Over limit" compares what the customer owes in all, converted at the rates of ${fixingLabel || "today"}, with its credit limit.`}
        </div>

        {isError && <Alert type="error" showIcon message="Could not load the customer invoices." />}
        {data?.truncated && !byCustomer && (
          <Alert
            type="info"
            showIcon
            message={`The list holds ${data.rows.length.toLocaleString("en-US")} invoices: every one still owed or to refund, then the newest of the others. The oldest are left out, and the counts and totals cover only these.`}
          />
        )}
        {data && !data.factsRead && (
          <Alert type="warning" showIcon message="The jobs' and customers' facts could not be read just now: names, people and credit limits may be blank, and My jobs and My customers may miss invoices. Open the page again in a moment." />
        )}

        {byCustomer ? (
          <CustomersTable
            rows={data && !isError ? shownCustomers : undefined}
            loading={isFetching && !data}
            emptyText={empty}
            resetKey={resetKey}
            visible={customerControls.visible}
            fixingLabel={fixingLabel}
            canSend={!!data?.canAct}
            onOpen={(customerId) => {
              // A click sets the customer filter and opens Unpaid (D7).
              setFilters((f) => ({ ...f, customerId }));
              setTab("unpaid");
            }}
          />
        ) : (
          <ReceivablesTable
            rows={data && !isError ? shown : undefined}
            loading={isFetching && !data}
            emptyText={empty}
            resetKey={resetKey}
            visible={invoiceControls.visible}
            onOpen={(id) => setParams({ invoice: id })}
            selection={canBatch ? { keys: selectedIds, onChange: (keys) => setTicked({ tab, keys }) } : undefined}
          />
        )}

        {batchRows && batchRows.length > 0 && (
          <BatchPaymentDialog
            rows={batchRows}
            today={today}
            onClose={() => setBatchRows(null)}
            onDone={() => {
              setBatchRows(null);
              setTicked({ tab, keys: [] });
            }}
          />
        )}

        <ReceivableDrawer id={openId} onClose={() => setParams({ invoice: null })} />
      </div>
    </div>
  );
}
