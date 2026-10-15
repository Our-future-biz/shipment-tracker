"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { Pill } from "@/components/Pill";
import { CountChip, PillTabs, SectionCard } from "@/components/SectionCard";
import { useSalesQuoteList } from "@/hooks/useSalesQuoteList";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { quoteHref, type QuoteOrigin } from "../_lib/quoteHref";
import { quoteProblem } from "../_lib/quoteProblem";
import { needsFollowUp, daysOpen, lastContactAgo, type SalesQuote } from "../_lib/salesQuote";
import { AWAITING_QUOTE_STATUSES } from "../_lib/types";
import { CustomerLink } from "./CustomerLink";
import { FollowUpDialog } from "./FollowUpDialog";
import { FollowUpTasksCard } from "./FollowUpTasksCard";
import { QuoteRefLink } from "./QuoteRefLink";
import { QuoteRoute } from "./QuoteRoute";
import { QuoteStatusPill } from "./QuoteStatusPill";
import { QuotesLoadError } from "./QuotesLoadError";

// How many quotes the list shows at a time.
const PAGE_SIZE = 50;

// A quote opened from this screen leads back to it.
const FROM_HERE: QuoteOrigin = { from: "followup" };

const OWNER_TABS = [
  { key: "mine", label: "Mine" },
  { key: "everyone", label: "Everyone" },
];

// The two blocks of the Follow-up page: the quotes that are with a customer, and the team's manual
// follow-up tasks.
export function FollowUpTab() {
  const router = useRouter();
  // Whose quotes are listed: everybody's, or only those of whoever is signed in.
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const withCustomer = { statuses: AWAITING_QUOTE_STATUSES.join(","), owner: mineOnly ? "me" : undefined };
  // Every quote that is with the customer - Quoted or in Feedback, and not expired - the one whose
  // customer has gone longest without hearing from us first. The server orders a quote nobody
  // recorded a contact on by when it was sent, or created, so it is not left for the end. The
  // ones due for a follow-up carry the red flag (needsFollowUp).
  const { quotes, total, isLoading, isError, reload } = useSalesQuoteList({
    ...withCustomer,
    sortBy: "lastContactAt",
    sortDirection: "asc",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  // How many of them are due for a follow-up. The flagged rows of one page are not all of them, so
  // the server counts - by the rule it flags by; the one row asked for is not used.
  const due = useSalesQuoteList({ ...withCustomer, followUp: "due", limit: 1 });
  const { followUpQuote } = useSalesQuotes();
  const toast = useToast();
  // The quote "Followed up" was pressed on, while its dialog is open.
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);

  // Quotes leave the list when they are decided, reworked or expire: a page past the end would be
  // an empty table under a list that has rows.
  const lastPage = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));
  useEffect(() => {
    if (!isLoading && !isError && page > lastPage) setPage(lastPage);
  }, [isLoading, isError, page, lastPage]);

  // Resolves with why the server refused, or with null: the dialog shows a refusal.
  const recordFollowUp = async (quoteNumber: string, note?: string) => {
    try {
      await followUpQuote({ quoteNumber, note });
      toast.success(`Follow-up recorded on ${quoteNumber}`);
      return null;
    } catch (err) {
      return quoteProblem(err).reason;
    }
  };

  const quoteColumns: ColumnsType<SalesQuote> = [
    {
      title: "Sales Number",
      dataIndex: "quoteNumber",
      width: 150,
      // The whole row opens the quote too.
      render: (v: string) => <QuoteRefLink quoteNumber={v} origin={FROM_HERE} />,
    },
    {
      title: "Customer",
      key: "cust",
      render: (_: unknown, r) => {
        const { origin, destination, serviceType } = r.data;
        const hasRoute = Boolean(origin || destination);
        return (
          <>
            {/* A name too long for the column is cut; hovering it shows all of it. */}
            <div className="truncate" title={r.data.customerName}>
              <CustomerLink customerId={r.data.customerId} name={r.data.customerName} />
            </div>
            {/* Where the cargo goes and how, as far as the quote says. */}
            {(hasRoute || serviceType) && (
              <div className="truncate text-xs text-slate-500">
                {hasRoute && <QuoteRoute origin={origin} destination={destination} />}
                {hasRoute && serviceType && " · "}
                {serviceType}
              </div>
            )}
          </>
        );
      },
    },
    { title: "Status", key: "status", width: 100, render: (_: unknown, r) => <QuoteStatusPill status={r.status} /> },
    { title: "Sales Owner", key: "owner", width: 150, ellipsis: true, render: (_: unknown, r) => r.ownerName || EMPTY_CELL },
    {
      title: "Last contact",
      key: "contact",
      width: 196,
      render: (_: unknown, r) => {
        const overdue = needsFollowUp(r);
        return (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {/* Without a sent date nobody knows when the customer got the quote; it is counted from its creation. */}
            <span className={overdue ? "font-bold text-red-600" : "text-slate-600"}>{lastContactAgo(r.lastContactAt) ?? "no contact recorded"}</span>
            {overdue && <Pill tone="red">Follow up</Pill>}
          </span>
        );
      },
    },
    {
      title: "Days open",
      key: "days",
      width: 96,
      align: "right",
      // Set off from the date beside it, which starts at the left of its cell. antd's own cell
      // padding is not in a cascade layer, hence the important flag.
      className: "tabular-nums !pr-5",
      render: (_: unknown, r) => {
        const days = daysOpen(r);
        return days === null ? EMPTY_CELL : <span className="text-slate-600">{days}</span>;
      },
    },
    {
      title: "Valid until",
      key: "valid",
      width: 104,
      // No quote in this list is expired: one whose date has passed is not with the customer any more.
      render: (_: unknown, r) => (r.validUntil ? <span className="text-slate-600 tabular-nums">{formatDate(r.validUntil)}</span> : EMPTY_CELL),
    },
    {
      title: <span className="sr-only">Action</span>,
      key: "followedUp",
      width: 110,
      align: "right",
      render: (_: unknown, r) => (
        <Button
          size="small"
          onClick={(e) => {
            // The row itself opens the quote.
            e.stopPropagation();
            setFollowUpFor(r.quoteNumber);
          }}
        >
          Followed up
        </Button>
      ),
    },
  ];

  let emptyText = mineOnly ? "None of your quotes needs a follow-up right now" : "Nothing needs a follow-up right now";
  // A list that is still being read is not an empty one, and neither is one that could not be read.
  if (isLoading) emptyText = "Loading quotes…";
  if (isError) emptyText = "Could not load quotes.";

  // Nothing is said about a list that could not be read, nor a number of the list shown before
  // while the one asked for is on its way.
  const dueCount = isError || due.isError || due.isLoading ? 0 : (due.total ?? 0);

  return (
    <>
      <SectionCard
        title="Quotes waiting for the customer"
        bodyClassName="p-2"
        extra={
          <>
            {dueCount > 0 && (
              <span className="text-xs font-semibold text-red-700 whitespace-nowrap">
                {dueCount.toLocaleString("en-US")} {dueCount === 1 ? "needs" : "need"} a follow-up
              </span>
            )}
            {total !== undefined && !isError && <CountChip count={isLoading ? "…" : total.toLocaleString("en-US")} />}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-2 pb-3">
          <div role="group" aria-label="Whose quotes">
            <PillTabs
              tabs={OWNER_TABS}
              active={mineOnly ? "mine" : "everyone"}
              onChange={(key) => {
                setMineOnly(key === "mine");
                setPage(1);
              }}
            />
          </div>
          <span className="ml-auto text-xs text-slate-500">Quoted or in feedback — flagged when the last contact is 3 or more days ago</span>
        </div>

        {isError && (
          <div className="px-2 pb-3">
            <QuotesLoadError onRetry={() => reload()} />
          </div>
        )}

        <Table<SalesQuote>
          size="small"
          // The columns keep their widths and the customer takes what is left: a long name is cut,
          // it does not push the table wider.
          tableLayout="fixed"
          rowKey="quoteNumber"
          loading={isLoading}
          dataSource={quotes}
          columns={quoteColumns}
          // The rows are the server's page; the total is the number of quotes that are with a customer.
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            onChange: setPage,
            size: "small",
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} entries`,
          }}
          scroll={{ x: 1080 }}
          locale={{ emptyText }}
          rowClassName="cursor-pointer"
          onRow={(record) => ({ onClick: () => router.push(quoteHref(record.quoteNumber, FROM_HERE)) })}
        />
      </SectionCard>

      <FollowUpTasksCard />

      {followUpFor && (
        <FollowUpDialog quoteNumber={followUpFor} onRecord={(note) => recordFollowUp(followUpFor, note)} onClose={() => setFollowUpFor(null)} />
      )}
    </>
  );
}
