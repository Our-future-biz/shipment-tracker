"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Spin, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PillTabs } from "@/components/SectionCard";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { CockpitCard, CockpitDialog, cockpitCards, plural, type CockpitCardKey } from "@/components/cockpit/CockpitCard";
import { CockpitFigure as Figure, CockpitLine as Line, CockpitNote, type CockpitNoteTone } from "@/components/cockpit/CockpitLine";
import { CockpitTiles, tileValue } from "@/components/cockpit/CockpitTiles";
import { formatAmount } from "@/lib/money";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useSalesManagersCockpit, type SalesCockpitMode, type SalesCockpitRow, type SalesManagersCockpit as Cockpit } from "@/hooks/useSalesManagersCockpit";
import { SalesPage } from "../../_components/SalesPage";
import { QuoteStatusPill } from "../../_components/QuoteStatusPill";
import { officeTime } from "../../_lib/officeTime";
import { quoteHref } from "../../_lib/quoteHref";
import { SALES_PAGES, salesManagersHref, type SalesManagersTab } from "../../_lib/tabs";
import { OPEN_QUOTE_STATUSES, serviceTypeLabel, type QuoteStatus } from "../../_lib/types";
import { useMarginInquiries } from "@/hooks/useMarginInquiries";
import { useSellingAmountRequests } from "@/hooks/useSellingAmountRequests";
import { COCKPIT_MODES, cockpitModeOf, inCockpitMode } from "../_lib/cockpitModes";
import { SalesQuoteInquiries } from "./SalesQuoteInquiries";
import { SalesCompanyApprovals } from "./SalesCompanyApprovals";
import { BillingApprovals } from "./BillingApprovals";
import { useCreditNoteRequests } from "@/hooks/useCreditNoteRequests";
import { useInvoiceChangeRequests } from "@/hooks/useInvoiceChangeRequests";
import { useSupplierApprovals } from "@/hooks/useSupplierApprovals";

// Sales → Managers (Council Outlay 6, step 2): what the sales team needs from a manager today.
// Tiles over the company's quotes, then what to act on today (URGENT) and within 48 hours
// (ATTENTION), the same anatomy as the Warehouse cockpit and the Shipments Needs Attention cards.
// Everything comes from one server answer, worked out in Prague time, so the counts never
// disagree with each other. For those who manage Sales; anybody else is told it is not theirs.

const PAGE = SALES_PAGES.managers;

// The Quotes list filters by one freight mode; Sea is three of them, so it is not passed on.
const LIST_SERVICE: Partial<Record<SalesCockpitMode, string>> = { air: "Air", rail: "Rail", road: "Road" };

// The cards, the tiles and the lines are the cockpits' shared parts (components/cockpit), in their
// own look; this page brings the quotes' wording, columns and links.
const CARDS = cockpitCards("quotes", "Nothing urgent in Sales.");

type TileKey = keyof Cockpit["tiles"];
interface TileDef {
  key: Exclude<TileKey, "openSellingCzk">;
  label: string;
  /** Where the tile leads: a list the Quotes page reads from its address, or Quote inquiries of the same mode. */
  href: (service: string | undefined, mode: SalesCockpitMode) => string;
  danger?: boolean;
}
const quotesHref = (params: Record<string, string>, service: string | undefined) =>
  `${SALES_PAGES.quotes.path}?${new URLSearchParams({ ...params, ...(service ? { service } : {}) })}`;
const OPEN = OPEN_QUOTE_STATUSES.join(",");
const TILES: TileDef[] = [
  { key: "openQuotes", label: "Open quotes", href: (s) => quotesHref({ status: OPEN }, s) },
  // Counted for the freight mode on screen, so it opens the inquiries of that mode.
  { key: "awaitingApproval", label: "Awaiting approval", href: (_, mode) => salesManagersHref({ tab: "inquiries", mode }), danger: true },
  { key: "followUpDue", label: "Follow-up due", href: (s) => quotesHref({ followup: "due" }, s), danger: true },
  { key: "draftsToFinish", label: "Drafts to finish", href: (s) => quotesHref({ status: "draft" }, s) },
  { key: "validSoon", label: "Valid until ≤ 7 days", href: (s) => quotesHref({ status: OPEN, valid: "7", sort: "validUntil" }, s) },
  { key: "noOwner", label: "Quoted by nobody", href: (s) => quotesHref({ status: OPEN, owner: "none" }, s), danger: true },
  { key: "wonThisMonth", label: "Won this month", href: (s) => quotesHref({ status: "won", month: "1" }, s) },
  { key: "lostThisMonth", label: "Lost this month", href: (s) => quotesHref({ status: "lost", month: "1" }, s) },
];

const czk = (amount: number) => formatAmount(Math.round(amount), "CZK");
const dash = <span className="text-slate-300">—</span>;
const PRAGUE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const rowHref = (r: SalesCockpitRow) => (r.kind === "quote" ? quoteHref(r.id) : SALES_PAGES.followup.path);

const refColumn = {
  title: "Sales Reference",
  key: "ref",
  width: 180,
  render: (_: unknown, r: SalesCockpitRow) => (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <Link href={rowHref(r)} className={`${r.kind === "quote" ? "tabular-nums" : ""} font-semibold ${LINK_CLASS}`}>
        {r.ref}
      </Link>
      {r.kind === "quote" && !r.status ? (
        // A question or answer on a quote the cockpit no longer reads (deleted, replaced, long closed).
        <span className="text-[11px] text-slate-500">Quote no longer open</span>
      ) : r.kind === "quote" ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <QuoteStatusPill status={r.status as QuoteStatus} />
          {r.serviceType && <span className="text-[11px] text-slate-500">{serviceTypeLabel(r.serviceType)}</span>}
        </span>
      ) : (
        <span className="text-[11px] text-slate-500">Follow-up task · {r.status}</span>
      )}
    </div>
  ),
};

const tagList = (r: SalesCockpitRow) => (
  <div className="flex flex-wrap gap-1.5">
    {r.tags.map((t, i) => (
      <Pill key={i} tone={t.urgent ? "red" : "amber"} className="max-w-full !whitespace-normal break-words">
        {t.text}
      </Pill>
    ))}
  </div>
);

// In a card the customer, owner and selling sit under the signals; the dialog gives them columns.
const signalsColumn = {
  title: "Signals",
  key: "tags",
  render: (_: unknown, r: SalesCockpitRow) => (
    <div className="flex flex-col gap-1 min-w-0">
      {tagList(r)}
      <div className="text-[12px] text-slate-500 truncate">
        {[r.customer, r.ownerName || (r.kind === "quote" ? "quoted by nobody" : "nobody assigned"), r.sellingCzk ? czk(r.sellingCzk) : ""].filter(Boolean).join(" · ")}
      </div>
    </div>
  ),
};

const CARD_COLUMNS: ColumnsType<SalesCockpitRow> = [refColumn, signalsColumn];

const DIALOG_COLUMNS: ColumnsType<SalesCockpitRow> = [
  { ...refColumn, width: 200 },
  { title: "Customer", dataIndex: "customer", width: 200, render: (v: string) => v || dash },
  { title: "Quoted By", dataIndex: "ownerName", width: 190, render: (v: string) => v || dash },
  { title: "Selling", dataIndex: "sellingCzk", width: 130, align: "right", render: (v: number | null) => (v ? <span className="tabular-nums">{czk(v)}</span> : dash) },
  { ...signalsColumn, render: (_: unknown, r: SalesCockpitRow) => tagList(r) },
];

function Tiles({ cockpit, isLoading, isError, service, mode }: { cockpit: Cockpit | null; isLoading: boolean; isError: boolean; service: string | undefined; mode: SalesCockpitMode }) {
  const valueOf = (key: TileDef["key"]): string =>
    tileValue(cockpit, { isLoading, isError }, ({ tiles: t }) => (key === "openQuotes" ? `${t.openQuotes}${t.openQuotes ? ` · ${czk(t.openSellingCzk)}` : ""}` : String(t[key])));
  return (
    <CockpitTiles
      tiles={TILES.map((t) => ({
        key: t.key,
        label: t.label,
        value: valueOf(t.key),
        hot: t.danger && !!cockpit && cockpit.tiles[t.key] > 0,
        href: t.href(service, mode),
      }))}
    />
  );
}

const HEALTH_TONE: CockpitNoteTone = { frame: "border-amber-200 bg-amber-50", text: "text-amber-800" };

// What keeps the figures from being whole: quotes whose margin can't be worked out, and a read
// that stopped at its limit. Quiet when there is nothing to say.
function HealthLine({ cockpit }: { cockpit: Cockpit }) {
  const { marginUnknown, sentNoCustomer, capped } = cockpit.health;
  if (!marginUnknown && !sentNoCustomer && !capped) return null;
  return (
    <CockpitNote tone={HEALTH_TONE}>
      {marginUnknown > 0 && (
        <span>
          <b>Margin unknown:</b> {plural(marginUnknown, "open quote")} (a ČNB rate is missing; their selling counts what converts)
        </span>
      )}
      {sentNoCustomer > 0 && (
        <span>
          <b>No customer record:</b> {plural(sentNoCustomer, "open quote")} sent to a customer not in Customers (no credit check)
        </span>
      )}
      {capped && (
        <span>
          <b>Part of the quotes:</b> more matched than the cockpit reads; the figures are of the newest.
        </span>
      )}
    </CockpitNote>
  );
}

const pct = (v: number | null) => (v === null ? "–" : `${v} %`);

// The audit line (H2): what managers were asked about margins over the last days and how they
// answered, company-wide. Self-approvals are allowed and counted here, by name in the quote's history (D9).
function AuditLine({ cockpit }: { cockpit: Cockpit }) {
  const a = cockpit.audit;
  if (!a) return null;
  return (
    <Line label={`Audit · last ${a.days} days · all modes`}>
      <Figure label="Asked" value={a.asked} />
      <Figure label="Approved" value={a.approved} />
      <Figure label="At a counter margin" value={a.counter} />
      <Figure label="Rejected" value={a.rejected} />
      <Figure label="Withdrawn" value={a.withdrawn} />
      <Figure label="Self-approvals" value={a.selfApprovals} hot={a.selfApprovals > 0} />
      <Figure label="Median time to decide" value={a.medianOfficeMinutesToDecide === null ? "–" : officeTime(a.medianOfficeMinutesToDecide)} />
      <Figure label="Waiting with the admins told" value={a.escalated} hot={a.escalated > 0} />
      <Figure label="Approvals that no longer cover" value={a.approvalsLapsed} hot={a.approvalsLapsed > 0} />
    </Line>
  );
}

const APPROVAL_WARNING: Record<string, string> = {
  rubber_stamp: "almost everything is approved: the guardrail may be a rubber stamp",
  too_strict: "most asks are rejected: the guardrail may be set wrong",
};

// The team line (H3): how the team sold over the last days, company-wide. Per-rep figures stay
// on Sales Report (D20).
function TeamLine({ cockpit }: { cockpit: Cockpit }) {
  const t = cockpit.team;
  if (!t) return null;
  return (
    <Line label={`Team · last ${t.days} days · all modes`}>
      <Figure label="Hit rate" value={`${pct(t.hitRatePercent)}${t.won + t.lost ? ` (${t.won} won / ${t.lost} lost)` : ""}`} />
      <Figure label="Median to first quotation" value={t.medianHoursToFirstSent === null ? "–" : `${t.medianHoursToFirstSent} h`} />
      <Figure label="Sent" value={t.sent} />
      <Figure label="Needed approval" value={pct(t.neededApprovalPercent)} />
      <Figure label="Approval rate" value={pct(t.approvalRatePercent)} hot={!!t.approvalWarning} />
      {t.lostByCategory.length > 0 && <Figure label="Lost by reason" value={t.lostByCategory.map((c) => `${c.category} ${c.count}`).join(" · ")} />}
      {t.approvalWarning && <span className="text-red-600">{APPROVAL_WARNING[t.approvalWarning]}</span>}
    </Line>
  );
}

export function SalesManagersContent() {
  const permissions = useSalesPermissions();
  if (permissions.status !== "ready" || !permissions.canManageSales) {
    return (
      <SalesPage title={PAGE.label}>
        {permissions.status === "loading" ? (
          <Spin />
        ) : permissions.status === "error" ? (
          <Alert
            type="error"
            showIcon
            message="Could not check whether you may open Sales → Managers."
            action={
              <Button size="small" onClick={() => permissions.reload()}>
                Retry
              </Button>
            }
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Sales → Managers is for managers and admins."
            description={
              <>
                Ask a manager when a quote needs their decision.{" "}
                <Link href={SALES_PAGES.quotes.path} className={LINK_CLASS}>
                  Back to Quotes
                </Link>
              </>
            }
          />
        )}
      </SalesPage>
    );
  }
  return <SalesManagersCockpit />;
}

function SalesManagersCockpit() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The tab (?tab=inquiries, approvals, billing) and the freight mode (?mode=) live in the address, so they survive a
  // reload and a bell item can link to the inquiries. The mode filters both tabs, and stays when
  // the tab changes.
  const tabParam = searchParams.get("tab");
  const tab: SalesManagersTab = tabParam === "inquiries" || tabParam === "approvals" || tabParam === "billing" ? tabParam : "cockpit";
  const mode = cockpitModeOf(searchParams.get("mode"));
  const go = (next: { tab?: SalesManagersTab; mode?: SalesCockpitMode }) =>
    router.replace(salesManagersHref({ tab: next.tab ?? tab, mode: next.mode ?? mode }), { scroll: false });
  const setMode = (next: SalesCockpitMode) => go({ mode: next });
  const { cockpit, isLoading, isError } = useSalesManagersCockpit(mode, tab === "cockpit");
  // The list of questions is read only where it is shown. The tab's count is the cockpit's
  // Awaiting approval there - the same mode, the same figure as the tile.
  const { inquiries } = useMarginInquiries({ enabled: tab === "inquiries" });
  // Selling amounts waiting are counted too; they belong to a shipment, not a freight mode of a quote.
  const { waiting: sellingAmountsWaiting } = useSellingAmountRequests();
  const inquiriesWaiting =
    (tab === "inquiries" ? inquiries.filter((r) => r.inquiry.status === "pending" && inCockpitMode(r.serviceType, mode)).length : (cockpit?.tiles.awaitingApproval ?? 0)) + sellingAmountsWaiting;
  // New suppliers waiting for a manager, counted on their tab (they have no freight mode).
  const { waiting: suppliersWaiting } = useSupplierApprovals();
  // Partial credit notes and issue-day invoice changes waiting for a manager, counted on their tab
  // (an invoice has no freight mode).
  const { waiting: creditNotesWaiting } = useCreditNoteRequests();
  const { waiting: invoiceChangesWaiting } = useInvoiceChangeRequests();
  const billingWaiting = creditNotesWaiting + invoiceChangesWaiting;
  const [openCard, setOpenCard] = useState<CockpitCardKey | null>(null);
  const service = LIST_SERVICE[mode];

  // A row opens its quote (or Follow-up for a task); its reference is a link, so the keyboard reaches it too.
  const rowProps = (r: SalesCockpitRow) => ({
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("a")) return;
      router.push(rowHref(r));
    },
  });

  const rowKey = (r: SalesCockpitRow) => `${r.kind}:${r.id}`;

  const renderCard = (key: CockpitCardKey) => (
    <CockpitCard<SalesCockpitRow>
      card={CARDS[key]}
      list={cockpit?.[key]}
      isLoading={isLoading}
      isError={isError}
      loadFailed="Could not load Sales."
      onShowAll={() => setOpenCard(key)}
      columns={CARD_COLUMNS}
      rowKey={rowKey}
      rowClassName="cursor-pointer"
      onRow={rowProps}
    />
  );

  const openList = openCard ? cockpit?.[openCard] : undefined;

  return (
    <SalesPage
      title={PAGE.label}
      subtitle="What the sales team needs from a manager today"
      extra={
        <span className="flex items-center gap-3 text-xs text-slate-500">
          {cockpit && <span>Updated {PRAGUE_TIME.format(new Date(cockpit.asOf))} · Prague time</span>}
          <Link href={SALES_PAGES.report.path} className={LINK_CLASS}>
            Sales Report
          </Link>
        </span>
      }
    >
      <Tabs
        activeKey={tab}
        onChange={(k) => go({ tab: k as SalesManagersTab })}
        className="[&>.ant-tabs-nav]:!mb-0"
        items={[
          { key: "cockpit", label: "Cockpit" },
          {
            key: "inquiries",
            label: (
              <span className="whitespace-nowrap">
                Quote inquiries
                {inquiriesWaiting > 0 && (
                  <Pill tone="amber" className="ml-1.5 tabular-nums">
                    {inquiriesWaiting}
                  </Pill>
                )}
              </span>
            ),
          },
          {
            key: "approvals",
            label: (
              <span className="whitespace-nowrap">
                Company approval
                {suppliersWaiting > 0 && (
                  <Pill tone="amber" className="ml-1.5 tabular-nums">
                    {suppliersWaiting}
                  </Pill>
                )}
              </span>
            ),
          },
          {
            key: "billing",
            label: (
              <span className="whitespace-nowrap">
                Billing approvals
                {billingWaiting > 0 && (
                  <Pill tone="amber" className="ml-1.5 tabular-nums">
                    {billingWaiting}
                  </Pill>
                )}
              </span>
            ),
          },
        ]}
      />

      {/* A new supplier and an invoice have no freight mode: their approvals are not filtered by one. */}
      {tab !== "approvals" && tab !== "billing" && (
        <div role="group" aria-label="Freight mode">
          <PillTabs tabs={COCKPIT_MODES} active={mode} onChange={setMode} />
        </div>
      )}

      {tab === "billing" ? (
        <BillingApprovals />
      ) : tab === "approvals" ? (
        <SalesCompanyApprovals />
      ) : tab === "inquiries" ? (
        <SalesQuoteInquiries mode={mode} />
      ) : (
        <>
          <Tiles cockpit={cockpit} isLoading={isLoading} isError={isError} service={service} mode={mode} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderCard("urgent")}
            {renderCard("attention")}
          </div>

          {cockpit && (
            <div className="flex flex-col gap-2">
              <AuditLine cockpit={cockpit} />
              <TeamLine cockpit={cockpit} />
              <HealthLine cockpit={cockpit} />
            </div>
          )}
        </>
      )}

      <CockpitDialog<SalesCockpitRow>
        card={openCard ? CARDS[openCard] : null}
        list={openList}
        onClose={() => setOpenCard(null)}
        columns={DIALOG_COLUMNS}
        rowKey={rowKey}
        rowClassName="cursor-pointer"
        onRow={rowProps}
      />
    </SalesPage>
  );
}
