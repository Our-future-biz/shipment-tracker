"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Modal, Spin, Table, Tag } from "antd";
import { WarningFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { PillTabs } from "@/components/SectionCard";
import { LINK_CLASS } from "@/components/linkClass";
import { formatAmount } from "@/lib/money";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useSalesManagersCockpit, type SalesCockpitMode, type SalesCockpitRow, type SalesManagersCockpit as Cockpit } from "@/hooks/useSalesManagersCockpit";
import { SalesPage } from "../../_components/SalesPage";
import { QuoteStatusPill } from "../../_components/QuoteStatusPill";
import { quoteHref } from "../../_lib/quoteHref";
import { SALES_PAGES } from "../../_lib/tabs";
import { OPEN_QUOTE_STATUSES, serviceTypeLabel, type QuoteStatus } from "../../_lib/types";

// Sales → Managers (Council Outlay 6, step 2): what the sales team needs from a manager today.
// Tiles over the company's quotes, then what to act on today (URGENT) and within 48 hours
// (ATTENTION), the same anatomy as the Warehouse cockpit and the Shipments Needs Attention cards.
// Everything comes from one server answer, worked out in Prague time, so the counts never
// disagree with each other. For those who manage Sales; anybody else is told it is not theirs.

const PAGE = SALES_PAGES.managers;
// A card lists only its first few; the count shows the total and the link opens them all.
const VISIBLE_ROWS = 3;

const MODES: { key: SalesCockpitMode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sea", label: "Sea" },
  { key: "air", label: "Air" },
  { key: "rail", label: "Rail" },
  { key: "road", label: "Road" },
];
// The Quotes list filters by one freight mode; Sea is three of them, so it is not passed on.
const LIST_SERVICE: Partial<Record<SalesCockpitMode, string>> = { air: "Air", rail: "Rail", road: "Road" };

type CardKey = "urgent" | "attention";
const CARDS: Record<CardKey, { title: string; window: string; linkLabel: string; empty: string; dialog: string; tone: { border: string; header: string; icon: string; link: string } }> = {
  urgent: {
    title: "Urgent",
    window: "act today",
    linkLabel: "Click here to show URGENT quotes",
    empty: "Nothing urgent in Sales.",
    dialog: "URGENT quotes",
    tone: { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", link: "text-red-600" },
  },
  attention: {
    title: "Attention",
    window: "within 48 hours",
    linkLabel: "Click here to show ATTENTION quotes",
    empty: "Nothing to watch within 48 hours.",
    dialog: "ATTENTION quotes",
    tone: { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", link: "text-orange-500" },
  },
};

type TileKey = keyof Cockpit["tiles"];
interface TileDef {
  key: Exclude<TileKey, "openSellingCzk">;
  label: string;
  /** Where the tile leads: a list the Quotes page reads from its address, or Follow-up. */
  href: (service: string | undefined) => string;
  danger?: boolean;
}
const quotesHref = (params: Record<string, string>, service: string | undefined) =>
  `${SALES_PAGES.quotes.path}?${new URLSearchParams({ ...params, ...(service ? { service } : {}) })}`;
const OPEN = OPEN_QUOTE_STATUSES.join(",");
const TILES: TileDef[] = [
  { key: "openQuotes", label: "Open quotes", href: (s) => quotesHref({ status: OPEN }, s) },
  { key: "followUpDue", label: "Follow-up due", href: () => SALES_PAGES.followup.path, danger: true },
  { key: "draftsToFinish", label: "Drafts to finish", href: (s) => quotesHref({ status: "draft" }, s) },
  { key: "validSoon", label: "Valid until ≤ 7 days", href: (s) => quotesHref({ status: OPEN, sort: "validUntil" }, s) },
  { key: "noOwner", label: "No Sales Owner", href: (s) => quotesHref({ status: OPEN, owner: "none" }, s), danger: true },
  { key: "wonThisMonth", label: "Won this month", href: (s) => quotesHref({ status: "won", month: "1" }, s) },
  { key: "lostThisMonth", label: "Lost this month", href: (s) => quotesHref({ status: "lost", month: "1" }, s) },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
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
      <Link href={rowHref(r)} className={`${r.kind === "quote" ? "font-mono" : ""} font-bold text-indigo-600 hover:underline`}>
        {r.ref}
      </Link>
      {r.kind === "quote" ? (
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
      <Tag key={i} color={t.urgent ? "red" : "orange"} className="m-0 max-w-full !whitespace-normal break-words">
        {t.text}
      </Tag>
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
      <div className="text-[11.5px] text-slate-500 truncate">
        {[r.customer, r.ownerName || (r.kind === "quote" ? "no Sales Owner" : "nobody assigned"), r.sellingCzk ? czk(r.sellingCzk) : ""].filter(Boolean).join(" · ")}
      </div>
    </div>
  ),
};

const CARD_COLUMNS: ColumnsType<SalesCockpitRow> = [refColumn, signalsColumn];

const DIALOG_COLUMNS: ColumnsType<SalesCockpitRow> = [
  { ...refColumn, width: 200 },
  { title: "Customer", dataIndex: "customer", width: 200, render: (v: string) => v || dash },
  { title: "Sales Owner", dataIndex: "ownerName", width: 190, render: (v: string) => v || dash },
  { title: "Selling", dataIndex: "sellingCzk", width: 130, align: "right", render: (v: number | null) => (v ? <span className="tabular-nums">{czk(v)}</span> : dash) },
  { ...signalsColumn, render: (_: unknown, r: SalesCockpitRow) => tagList(r) },
];

function Tiles({ cockpit, isLoading, isError, service }: { cockpit: Cockpit | null; isLoading: boolean; isError: boolean; service: string | undefined }) {
  const valueOf = (key: TileDef["key"]): string => {
    // A failed request must not read as "nothing to do".
    if (!cockpit) return isLoading ? "…" : isError ? "–" : "0";
    const t = cockpit.tiles;
    return key === "openQuotes" ? `${t.openQuotes}${t.openQuotes ? ` · ${czk(t.openSellingCzk)}` : ""}` : String(t[key]);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TILES.map((t) => {
        const value = valueOf(t.key);
        const hot = t.danger && !!cockpit && cockpit.tiles[t.key] > 0;
        return (
          <Link
            key={t.key}
            href={t.href(service)}
            aria-label={`${t.label}: ${value}`}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] !text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <span className="font-medium">{t.label}:</span>
            <span className={`font-bold tabular-nums ${hot ? "text-red-600" : "text-slate-900"}`}>{value}</span>
          </Link>
        );
      })}
    </div>
  );
}

// What keeps the figures from being whole: quotes whose margin can't be worked out, and a read
// that stopped at its limit. Quiet when there is nothing to say.
function HealthLine({ cockpit }: { cockpit: Cockpit }) {
  const { marginUnknown, capped } = cockpit.health;
  if (!marginUnknown && !capped) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      {marginUnknown > 0 && (
        <span>
          <b>Margin unknown:</b> {plural(marginUnknown, "open quote")} (a ČNB rate is missing; their selling counts what converts)
        </span>
      )}
      {capped && (
        <span>
          <b>Part of the quotes:</b> more matched than the cockpit reads; the figures are of the newest.
        </span>
      )}
    </div>
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The freight mode lives in the address (?mode=), so it survives a reload and can be linked to.
  const mode: SalesCockpitMode = MODES.find((m) => m.key === searchParams.get("mode"))?.key ?? "all";
  const setMode = (next: SalesCockpitMode) => router.replace(next === "all" ? pathname : `${pathname}?mode=${next}`, { scroll: false });
  const { cockpit, isLoading, isError } = useSalesManagersCockpit(mode, true);
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const service = LIST_SERVICE[mode];

  // A row opens its quote (or Follow-up for a task); its reference is a link, so the keyboard reaches it too.
  const rowProps = (r: SalesCockpitRow) => ({
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("a")) return;
      router.push(rowHref(r));
    },
  });

  const renderCard = (key: CardKey) => {
    const { title, window, linkLabel, empty, tone } = CARDS[key];
    const list = cockpit?.[key];
    const total = list?.total ?? 0;
    const hot = total > 0;
    return (
      <section aria-label={`${title} — ${window}`} className={`bg-white border rounded-2xl overflow-hidden ${hot ? tone.border : "border-slate-200"}`}>
        <div className={`flex items-center gap-2 px-4 py-2.5 ${hot ? tone.header : "bg-slate-50"}`}>
          <WarningFilled className={hot ? tone.icon : "text-slate-300"} />
          <span className="text-[13px] font-bold uppercase tracking-wider text-slate-800">{title}</span>
          <span
            aria-label={isError ? "Count unavailable" : plural(total, "item")}
            className={`min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center bg-white text-[13px] font-bold tabular-nums ${hot ? tone.link : "text-slate-500"}`}
          >
            {isError ? "–" : isLoading ? "…" : total}
          </span>
          <span className="text-[13px] text-slate-600">{window}</span>
        </div>
        <Table<SalesCockpitRow>
          size="small"
          rowKey={(r) => `${r.kind}:${r.id}`}
          showHeader={false}
          loading={isLoading}
          locale={{
            emptyText: isError ? <span className="text-[13px] text-red-500">Could not load Sales.</span> : <span className="text-[13px] text-slate-400">{empty}</span>,
          }}
          footer={
            hot
              ? () => (
                  <button type="button" onClick={() => setOpenCard(key)} className={`p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer hover:underline ${tone.link}`}>
                    {linkLabel}
                  </button>
                )
              : undefined
          }
          dataSource={(list?.rows ?? []).slice(0, VISIBLE_ROWS)}
          columns={CARD_COLUMNS}
          tableLayout="fixed"
          pagination={false}
          rowClassName="cursor-pointer"
          onRow={rowProps}
        />
      </section>
    );
  };

  const openList = openCard ? cockpit?.[openCard] : undefined;

  return (
    <SalesPage
      title={PAGE.label}
      subtitle="What the sales team needs from a manager today"
      extra={
        <span className="flex items-center gap-3 text-xs text-slate-500">
          {cockpit && <span>Updated {PRAGUE_TIME.format(new Date(cockpit.asOf))} · Prague time</span>}
          <Link href={SALES_PAGES.report.path} className="text-indigo-600 hover:underline">
            Sales Report
          </Link>
        </span>
      }
    >
      <div role="group" aria-label="Freight mode">
        <PillTabs tabs={MODES} active={mode} onChange={setMode} />
      </div>

      <Tiles cockpit={cockpit} isLoading={isLoading} isError={isError} service={service} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderCard("urgent")}
        {renderCard("attention")}
      </div>

      {cockpit && <HealthLine cockpit={cockpit} />}

      {/* Wide enough for the columns; the table scrolls sideways rather than spill out on a narrow window. */}
      <Modal
        open={!!openCard}
        onCancel={() => setOpenCard(null)}
        title={
          openCard && (
            <div>
              <div className="text-base font-semibold">{CARDS[openCard].dialog}</div>
              <div className="text-xs text-slate-500 font-normal mt-0.5">
                {plural(openList?.total ?? 0, "item")} — {CARDS[openCard].window}
                {openList && openList.total > openList.rows.length ? ` · the first ${openList.rows.length} are listed` : ""}
              </div>
            </div>
          )
        }
        width="min(1200px, calc(100vw - 48px))"
        footer={null}
        destroyOnHidden
      >
        <Table<SalesCockpitRow>
          size="small"
          rowKey={(r) => `${r.kind}:${r.id}`}
          scroll={{ x: "max-content" }}
          dataSource={openList?.rows ?? []}
          columns={DIALOG_COLUMNS}
          pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
          rowClassName="cursor-pointer"
          onRow={rowProps}
        />
      </Modal>
    </SalesPage>
  );
}
