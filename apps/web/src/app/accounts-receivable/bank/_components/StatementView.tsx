"use client";

import { useMemo, useState } from "react";
import { Alert, Pagination, Spin } from "antd";
import { BackButton } from "@/components/BackLink";
import { CountedTabs } from "@/components/finance/CountedTabs";
import { Fact } from "@/components/finance/DrawerParts";
import { useBankStatement, useOwedInvoices } from "@/hooks/useReceivableTools";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { businessDateTime } from "@/lib/date";
import { CARD, EMPTY_STATE, HINT, PAGE_TITLE, REF } from "@/styles/ui";
import { ENTRY_TABS, firstEntryTab, inEntryTab, isOpenEntry, periodText, type EntryTab, type InvoiceChoice } from "../_lib/bank";
import { EntryCard } from "./EntryCard";

// One bank statement: what was read from the file and its entries. Money in still to decide shows the invoices it may
// pay (worked out again at each read from the invoices owed now); a manager puts it on one or several and confirms,
// or sets it aside with a reason. Decided entries say who decided and when; money out is shown for the record only.

const PAGE_SIZE = 25;

export function StatementView({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const query = useBankStatement(id);
  const data = query.data;
  const [tab, setTab] = useState<EntryTab | null>(null);
  const [page, setPage] = useState(1);
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const shownTab = tab ?? firstEntryTab(entries);
  const shown = useMemo(() => entries.filter((e) => inEntryTab(e, shownTab)), [entries, shownTab]);
  const canAct = !!data?.canAct;
  const anyOpen = entries.some((e) => isOpenEntry(e) && !e.firstReadIn);

  // The invoices owed now, to choose one the matching did not propose.
  const owed = useOwedInvoices(canAct && anyOpen);
  const owedChoices = useMemo<InvoiceChoice[]>(
    () => (owed.data ?? []).map((r) => ({ invoiceId: r.id, number: r.number, customer: r.customer, currency: r.currency, leftToPay: r.leftToPay, version: r.version })),
    [owed.data],
  );

  const back = (
    <BackButton onClick={onBack} className="-mb-3 self-start">
      All bank statements
    </BackButton>
  );
  if (query.isLoading) {
    return (
      <>
        {back}
        <Spin />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {back}
        <Alert type="error" showIcon message={isNotFound(query.error) ? "This bank statement is not there." : `Could not load the bank statement: ${apiErrorMessage(query.error)}`} />
      </>
    );
  }

  const s = data.statement;
  const counts = {
    decide: entries.filter((e) => inEntryTab(e, "decide")).length,
    confirmed: entries.filter((e) => inEntryTab(e, "confirmed")).length,
    ignored: entries.filter((e) => inEntryTab(e, "ignored")).length,
    out: entries.filter((e) => inEntryTab(e, "out")).length,
    all: entries.length,
  };
  // A confirm moves an entry out of To decide: the page never stays past the last one.
  const current = Math.min(page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE)));
  const pageRows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <>
      {back}
      <div className={`flex flex-col gap-3 ${CARD} px-4 py-3`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h1 className={`${PAGE_TITLE} break-all`}>{s.fileName}</h1>
          <CountedTabs
            ariaLabel="Entries"
            tabs={ENTRY_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], dividerBefore: t.dividerBefore }))}
            active={shownTab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <Fact label="Account">
            <span className={REF}>{s.accountIban || "—"}</span> {s.currency}
          </Fact>
          <Fact label="Period">{periodText(s.fromDate, s.toDate)}</Fact>
          <Fact label="Statement">
            {s.format}
            {s.statementRef ? ` · ${s.statementRef}` : ""}
          </Fact>
          <Fact label="Booked entries">{s.entries}</Fact>
          <Fact label="Read by">{s.importedBy || "—"}</Fact>
          <Fact label="Read on">{businessDateTime(s.importedAt)}</Fact>
        </div>
      </div>

      <div className={HINT}>
        The file itself is not kept: only what was read from it. A payment is noted only when a manager confirms it, on the day the bank booked it, with the bank&apos;s
        reference; each amount at most what is left to pay on its invoice, together at most the payment.
        {!canAct && " Only a manager confirms a payment or sets an entry aside."}
      </div>
      {data.candidatesCapped && (
        <Alert type="warning" showIcon message="More invoices are owed than the matching looked at: an invoice may be missing from the proposals. Choose it under “Another invoice”." />
      )}
      {query.isError && <Alert type="warning" showIcon message={`Could not read the statement again: ${apiErrorMessage(query.error)}. What is shown may be out of date.`} />}

      <div className="flex flex-col gap-3">
        {pageRows.length === 0 ? (
          <div className={`${CARD} ${EMPTY_STATE}`}>{shownTab === "decide" ? "Nothing waits to be decided." : "No entries here."}</div>
        ) : (
          pageRows.map((e) => (
            <EntryCard
              key={e.id}
              statementId={s.id}
              entry={e}
              canAct={canAct}
              owed={owedChoices}
              owedLoading={owed.isLoading}
              onOpenStatement={onOpen}
            />
          ))
        )}
      </div>
      {shown.length > PAGE_SIZE && (
        <Pagination className="self-end" current={current} pageSize={PAGE_SIZE} total={shown.length} showSizeChanger={false} onChange={(p) => setPage(p)} />
      )}
    </>
  );
}
