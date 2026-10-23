"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, Table, Tag, Tooltip } from "antd";
import { WarningFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { PageHeader } from "@/components/PageHeader";
import { useManagersCockpit, type CockpitRow, type ManagersCockpit as Cockpit } from "@/hooks/useManagersCockpit";
import { Badge, VISIT_TONE, nf } from "../../gate-log/_lib/gate";
import { TERMS } from "../../_lib/glossary";
import { CHIPS, type ChipId } from "../../_lib/worklist";
import { HealthLine } from "../../_components/tabs/ReportsTab";

// The warehouse managers' cockpit (Council Outlay 5, steps 1 and 2): the Positions quick filters as
// tiles, then what to act on today (URGENT) and within 48 hours (ATTENTION), the link with
// Shipments and storage, what is owed to Shipments, Trucking and suppliers, and what managers did
// in the last days. Everything comes from one server answer, worked
// out over every record of the company in Prague time, so the counts never disagree with each other.
// Same anatomy as the Shipments page's Needs Attention cards.

// A card lists only its first few; the count shows the total and the link opens them all.
const VISIBLE_ROWS = 3;

type CardKey = "urgent" | "attention";

const CARDS: Record<CardKey, { title: string; window: string; linkLabel: string; empty: string; dialog: string; tone: { border: string; header: string; icon: string; link: string } }> = {
  urgent: {
    title: "Urgent",
    window: "act today",
    linkLabel: "Click here to show URGENT positions",
    empty: "Nothing urgent in the warehouse.",
    dialog: "URGENT positions",
    tone: { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", link: "text-red-600" },
  },
  attention: {
    title: "Attention",
    window: "within 48 hours",
    linkLabel: "Click here to show ATTENTION positions",
    empty: "Nothing to watch within 48 hours.",
    dialog: "ATTENTION positions",
    tone: { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", link: "text-orange-500" },
  },
};

// The tiles open Positions with the quick filter of the same name and count by its rule.
type TileKey = "inWarehouse" | "expectedToday" | "needsAttention" | "onHold" | "customsDeadline" | "chargeable";
const TILES: { key: TileKey; chip: ChipId; danger?: boolean }[] = [
  { key: "inWarehouse", chip: "inWarehouse" },
  { key: "expectedToday", chip: "expectedToday" },
  { key: "needsAttention", chip: "attention", danger: true },
  { key: "onHold", chip: "onHold", danger: true },
  { key: "customsDeadline", chip: "customsDeadline", danger: true },
  { key: "chargeable", chip: "chargeable", danger: true },
];
const chipOf = (id: ChipId) => CHIPS.find((c) => c.id === id)!;
const tileLabel = (key: TileKey, chip: ChipId) => (key === "needsAttention" ? TERMS.needsAttention : chipOf(chip).label);

const rowHref = (r: CockpitRow) => (r.kind === "container" ? `/warehouse-concept/containers/${r.id}` : `/warehouse-concept/gate-log/${r.id}`);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const dash = <span className="text-slate-300">—</span>;

const PRAGUE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const refColumn = {
  title: TERMS.warehouseRef,
  key: "ref",
  width: 170,
  render: (_: unknown, r: CockpitRow) => (
    <div className="min-w-0">
      <Link href={rowHref(r)} className="font-mono font-bold text-indigo-600 hover:underline">
        {r.ref}
      </Link>
      {r.sub && <div className="font-mono text-[11px] text-slate-500 truncate">{r.sub}</div>}
    </div>
  ),
};

const directionColumn = {
  title: TERMS.direction,
  key: "direction",
  width: 120,
  render: (_: unknown, r: CockpitRow) => <Badge tone={VISIT_TONE[r.visit] ?? ""}>{r.direction}</Badge>,
};

const signalsColumn = {
  title: "Signals",
  key: "tags",
  render: (_: unknown, r: CockpitRow) => (
    <div className="flex flex-wrap gap-1.5">
      {r.tags.map((t, i) => (
        <Tag key={i} color={t.urgent ? "red" : "orange"} className="m-0 max-w-full !whitespace-normal break-words">
          {t.text}
        </Tag>
      ))}
    </div>
  ),
};

// In a card the direction sits under the reference, so the signals keep the width and wrap.
const CARD_COLUMNS: ColumnsType<CockpitRow> = [
  {
    ...refColumn,
    width: 160,
    render: (v: unknown, r: CockpitRow) => (
      <div className="flex flex-col items-start gap-1">
        {refColumn.render(v, r)}
        {directionColumn.render(v, r)}
      </div>
    ),
  },
  signalsColumn,
];

const DIALOG_COLUMNS: ColumnsType<CockpitRow> = [
  refColumn,
  { title: "Customer", dataIndex: "customer", width: 180, render: (v: string) => v || dash },
  directionColumn,
  { title: TERMS.lifecycle, dataIndex: "lifecycle", width: 140, render: (v: string) => v || dash },
  { title: "Free time", dataIndex: "freeTime", width: 180, render: (v: string) => v || dash },
  signalsColumn,
];

function Tiles({ cockpit, isLoading, isError }: { cockpit: Cockpit | null; isLoading: boolean; isError: boolean }) {
  const valueOf = (key: TileKey): string => {
    // A failed request must not read as "nothing in the warehouse".
    if (!cockpit) return isLoading ? "…" : isError ? "–" : "0";
    const t = cockpit.tiles;
    return key === "chargeable" ? `${t.chargeable}${t.chargeable ? ` · est. CZK ${nf(t.chargeableCzk)}` : ""}` : String(t[key]);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TILES.map((t) => {
        const label = tileLabel(t.key, t.chip);
        const value = valueOf(t.key);
        const hot = t.danger && !!cockpit && cockpit.tiles[t.key] > 0;
        return (
          <Tooltip key={t.key} title={chipOf(t.chip).hint} mouseEnterDelay={0.4}>
            <Link
              href={`/warehouse-concept?view=${t.chip}`}
              aria-label={`${label}: ${value} — open in Positions`}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] !text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors"
            >
              <span className="font-medium">{label}:</span>
              <span className={`font-bold tabular-nums ${hot ? "text-red-600" : "text-slate-900"}`}>{value}</span>
            </Link>
          </Tooltip>
        );
      })}
    </div>
  );
}

// What the warehouse owes Shipments, Trucking and the suppliers and has not delivered: red when
// something failed for good, amber when it only waits too long.
function DeliveryLine({ cockpit }: { cockpit: Cockpit }) {
  const d = cockpit.delivery;
  const failed = d.truckingFailed + d.supplierEmailsFailed > 0;
  const waiting = d.shipmentUpdatesWaiting + d.truckingWaiting > 0;
  const tone = failed ? "border-red-200 bg-red-50 text-red-700" : waiting ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600";
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border px-4 py-2 text-xs ${tone}`}>
      <span>
        <b>Waiting over {d.staleMinutes} min:</b> {plural(d.shipmentUpdatesWaiting, "shipment update")} · {plural(d.truckingWaiting, "event")} for Trucking
      </span>
      <span>
        <b>Not sent to Trucking:</b> {plural(d.truckingFailed, "event")}
      </span>
      <span>
        <b>Supplier e-mails failed</b> (last {d.supplierEmailDays} days): {plural(d.supplierEmailsFailed, "position")}
        {d.supplierEmailsFailed > 0 && (
          <Link href="/warehouse-concept?tab=remeasurement" className="ml-2 font-semibold underline">
            Open Remeasurement / Release
          </Link>
        )}
      </span>
    </div>
  );
}

function AuditLine({ cockpit }: { cockpit: Cockpit }) {
  const a = cockpit.audit;
  const parts = [
    plural(a.overrides, "override"),
    plural(a.voids, "voided stamp"),
    plural(a.refusals, "refusal"),
    plural(a.archivedWithStamps, "archived with stamps", "archived with stamps"),
    plural(a.shipmentsDeleted, "shipment deleted (position kept)", "shipments deleted (positions kept)"),
  ];
  const any = a.overrides + a.voids + a.refusals + a.archivedWithStamps + a.shipmentsDeleted > 0;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
      <b>Last {a.days} days:</b>
      <span>{parts.join(" · ")}</span>
      {any && (
        <Link href="/warehouse-concept?tab=gatelog" className="ml-2 font-semibold underline">
          Open the Gate Log
        </Link>
      )}
    </div>
  );
}

export function ManagersCockpit() {
  const router = useRouter();
  const { cockpit, isLoading, isError } = useManagersCockpit();
  const [openCard, setOpenCard] = useState<CardKey | null>(null);

  // A row opens its record; its Warehouse ref is a link, so the keyboard reaches it too.
  const rowProps = (r: CockpitRow) => ({
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
        {/* No header row: the card's own header already says what the list is. */}
        <Table<CockpitRow>
          size="small"
          rowKey={(r) => `${r.kind}:${r.id}`}
          showHeader={false}
          loading={isLoading}
          locale={{
            emptyText: isError ? <span className="text-[13px] text-red-500">Could not load the warehouse.</span> : <span className="text-[13px] text-slate-400">{empty}</span>,
          }}
          footer={
            hot
              ? () => (
                  <button
                    type="button"
                    onClick={() => setOpenCard(key)}
                    className={`p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer hover:underline ${tone.link}`}
                  >
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
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
        <PageHeader
          title="Managers"
          breadcrumb={
            <Link href="/warehouse-concept" className="text-slate-500 hover:text-indigo-600">
              Warehouse Concept
            </Link>
          }
          extra={
            <span className="flex items-center gap-3 text-xs text-slate-500">
              {cockpit && <span>Updated {PRAGUE_TIME.format(new Date(cockpit.asOf))} · Prague time</span>}
              <Link href="/warehouse-concept?tab=reports" className="text-indigo-600 hover:underline">
                Reports
              </Link>
            </span>
          }
        />

        <Tiles cockpit={cockpit} isLoading={isLoading} isError={isError} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderCard("urgent")}
          {renderCard("attention")}
        </div>

        {cockpit && (
          <>
            <HealthLine report={cockpit} />
            <DeliveryLine cockpit={cockpit} />
            <AuditLine cockpit={cockpit} />
          </>
        )}
      </div>

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
        <Table<CockpitRow>
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
    </div>
  );
}
