"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PageHeader } from "@/components/PageHeader";
import { CockpitCard, CockpitDialog, cockpitCards, plural, type CockpitCardKey, type CockpitCardLook, type CockpitTone } from "@/components/cockpit/CockpitCard";
import { CockpitNote, NOTE_TONES } from "@/components/cockpit/CockpitLine";
import { CockpitTiles, tileValue, type CockpitTileLook } from "@/components/cockpit/CockpitTiles";
import { useManagersCockpit, type CockpitRow, type ManagersCockpit as Cockpit } from "@/hooks/useManagersCockpit";
import { Badge, VISIT_TONE, nf } from "../../gate-log/_lib/gate";
import { TERMS } from "../../_lib/glossary";
import { CHIPS, type ChipId } from "../../_lib/worklist";
import { HealthLine } from "../../_components/tabs/ReportsTab";
import { useWarehouseInquiries } from "@/hooks/useWarehouseInquiries";
import { QuoteInquiries } from "./QuoteInquiries";
import { shipmentsManagersHref } from "@/app/shipments/managers/_lib/cockpitAddress";
import { useCustomsOfficeApprovals } from "@/hooks/useCustomsOfficeRequests";
import { useDocumentChangeApprovals } from "@/hooks/useDocumentChangeRequests";
import { useAuth } from "@/lib/auth/AuthContext";
import { isWarehouseManagerOnly } from "@/lib/concepts";
import { CARD, EMPTY, HEADING, HINT, LINK, REF } from "@/styles/ui";

// The warehouse managers' cockpit (Council Outlay 5, steps 1 to 3): the Positions quick filters as
// tiles, then what to act on today (URGENT) and within 48 hours (ATTENTION), the link with
// Shipments and storage, what is owed to Shipments, Trucking and suppliers, and what managers did
// in the last days. Everything comes from one server answer, worked
// out over every record of the company in Prague time, so the counts never disagree with each other.
// Same anatomy as the Shipments page's Needs Attention cards.

// The cards, the tiles and the lines are the cockpits' shared parts (components/cockpit). This page
// was drawn before them and keeps its own look: a plain frame and bar, a grey tile, an indigo link.
const TONES: Record<CockpitCardKey, CockpitTone> = {
  urgent: { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", text: "text-red-600" },
  attention: { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", text: "text-amber-600" },
};
const CARDS = cockpitCards("positions", "Nothing urgent in the warehouse.", TONES);
const CARD_LOOK: CockpitCardLook = {
  frame: (tone) => `bg-white border rounded-xl shadow-sm overflow-hidden ${tone ? tone.border : "border-slate-200"}`,
  bar: (tone) => `flex items-center gap-2.5 min-h-[42px] px-4 py-2 ${tone ? tone.header : "bg-slate-50"}`,
  window: HINT,
  error: "text-[13px] text-red-600",
  showAll: () => `${LINK} p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer`,
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
const dash = <span className={EMPTY}>—</span>;

const PRAGUE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// `linked`: the reference leads to the record. Not for an admin or a manager who sees only this page
// of Warehouse Concept (isWarehouseManagerOnly): the records are superadmin pages, so it is plain text.
const refColumn = (linked: boolean) => ({
  title: TERMS.warehouseRef,
  key: "ref",
  width: 170,
  render: (_: unknown, r: CockpitRow) => (
    <div className="min-w-0">
      {linked ? (
        <Link href={rowHref(r)} className={`${REF} font-bold ${LINK}`}>
          {r.ref}
        </Link>
      ) : (
        <span className={`${REF} font-bold text-slate-900`}>{r.ref}</span>
      )}
      {r.sub && <div className={`tabular-nums ${HINT} truncate`}>{r.sub}</div>}
    </div>
  ),
});

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
        <Badge key={i} tone={t.urgent ? "r" : "a"} className="max-w-full !whitespace-normal break-words">
          {t.text}
        </Badge>
      ))}
    </div>
  ),
};

// In a card the direction sits under the reference, so the signals keep the width and wrap.
const cardColumns = (linked: boolean): ColumnsType<CockpitRow> => [
  {
    ...refColumn(linked),
    width: 160,
    render: (v: unknown, r: CockpitRow) => (
      <div className="flex flex-col items-start gap-1">
        {refColumn(linked).render(v, r)}
        {directionColumn.render(v, r)}
      </div>
    ),
  },
  signalsColumn,
];

const dialogColumns = (linked: boolean): ColumnsType<CockpitRow> => [
  refColumn(linked),
  { title: "Customer", dataIndex: "customer", width: 180, render: (v: string) => v || dash },
  directionColumn,
  { title: TERMS.lifecycle, dataIndex: "lifecycle", width: 140, render: (v: string) => v || dash },
  { title: "Free time", dataIndex: "freeTime", width: 180, render: (v: string) => v || dash },
  signalsColumn,
];

// The tile's look; a link to Positions adds the hover.
const TILE = "flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] !text-slate-600";
const TILE_LOOK: CockpitTileLook = { link: `${TILE} hover:border-slate-300 hover:bg-slate-50 transition-colors`, plain: TILE };

function Tiles({ cockpit, isLoading, isError, linked }: { cockpit: Cockpit | null; isLoading: boolean; isError: boolean; linked: boolean }) {
  const valueOf = (key: TileKey): string =>
    // The money as Shipments → Managers writes it: "20,350 CZK" (user council M17).
    tileValue(cockpit, { isLoading, isError }, ({ tiles: t }) => (key === "chargeable" ? `${t.chargeable}${t.chargeable ? ` · est. ${nf(t.chargeableCzk)} CZK` : ""}` : String(t[key])));
  return (
    <CockpitTiles
      look={TILE_LOOK}
      tiles={TILES.map((t) => {
        const label = tileLabel(t.key, t.chip);
        const value = valueOf(t.key);
        return {
          key: t.key,
          label,
          value,
          hot: t.danger && !!cockpit && cockpit.tiles[t.key] > 0,
          href: linked ? `/warehouse-concept?view=${t.chip}` : undefined,
          ariaLabel: `${label}: ${value} — open in Positions`,
          hint: chipOf(t.chip).hint,
        };
      })}
    />
  );
}

// What the warehouse owes Shipments, Trucking and the suppliers and has not delivered: red when
// something failed for good, amber when it only waits too long.
function DeliveryLine({ cockpit, linked }: { cockpit: Cockpit; linked: boolean }) {
  const d = cockpit.delivery;
  const failed = d.truckingFailed + d.supplierEmailsFailed > 0;
  const waiting = d.shipmentUpdatesWaiting + d.truckingWaiting > 0;
  const tone = failed ? NOTE_TONES.red : waiting ? NOTE_TONES.amber : NOTE_TONES.plain;
  return (
    <CockpitNote tone={tone}>
      <span>
        <b>Waiting over {d.staleMinutes} min:</b> {plural(d.shipmentUpdatesWaiting, "shipment update")} · {plural(d.truckingWaiting, "event")} for Trucking
      </span>
      <span>
        <b>Not sent to Trucking:</b> {plural(d.truckingFailed, "event")}
      </span>
      <span>
        <b>Supplier e-mails failed</b> (last {d.supplierEmailDays} days): {plural(d.supplierEmailsFailed, "position")}
        {linked && d.supplierEmailsFailed > 0 && (
          <Link href="/warehouse-concept?tab=remeasurement" className={`${LINK} ml-2 font-semibold`}>
            Open Remeasurement / Release
          </Link>
        )}
      </span>
    </CockpitNote>
  );
}

function AuditLine({ cockpit, linked }: { cockpit: Cockpit; linked: boolean }) {
  const a = cockpit.audit;
  const parts = [
    `${plural(a.overrides, "override")}${a.overridesPastCustoms ? ` (${a.overridesPastCustoms} past Customs)` : ""}`,
    plural(a.voids, "voided stamp"),
    plural(a.refusals, "refusal"),
    plural(a.archivedWithStamps, "archived with stamps", "archived with stamps"),
    plural(a.shipmentsDeleted, "shipment deleted (position kept)", "shipments deleted (positions kept)"),
  ];
  const any = a.overrides + a.voids + a.refusals + a.archivedWithStamps + a.shipmentsDeleted > 0;
  return (
    <CockpitNote tight>
      <b>Last {a.days} days:</b>
      <span>{parts.join(" · ")}</span>
      {linked && any && (
        <Link href="/warehouse-concept?tab=gatelog" className={`${LINK} ml-2 font-semibold`}>
          Open the Gate Log
        </Link>
      )}
    </CockpitNote>
  );
}

// The requests to change a Customs Office or an approved document are answered on Shipments →
// Managers → Approvals (Council Outlay 11, D14). This page keeps how many wait and the way there.
// `partial`: one of the two lists could not be read, so the count is not the whole of it;
// `loading`: one of them is not there yet, so there is no count to show.
function ApprovalsMoved({ waiting, partial, loading }: { waiting: number; partial: boolean; loading: boolean }) {
  return (
    <section className={`${CARD} flex flex-col gap-1.5 px-4 py-4`}>
      <h2 className={HEADING}>Document changes and Customs Office changes are decided on Shipments → Managers</h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-700">
        {loading ? (
          // Not known is not zero.
          <span aria-label="Loading the approvals" className="text-slate-500">
            …
          </span>
        ) : partial ? (
          <span className="text-red-600">
            {waiting > 0 ? `At least ${waiting} waiting for approval: part of the approvals could not be read.` : "How many are waiting is not known: the approvals could not be read."}
          </span>
        ) : waiting > 0 ? (
          <span>
            <b className="tabular-nums text-slate-900">{waiting}</b> waiting for approval
          </span>
        ) : (
          <span className="text-slate-500">Nothing waiting for approval.</span>
        )}
        <Link href={shipmentsManagersHref({ tab: "approvals" })} className={`${LINK} font-semibold`}>
          Open Shipments → Managers → Approvals
        </Link>
      </div>
    </section>
  );
}

// The page's tabs: the cockpit, Sales' questions waiting for the warehouse (?tab=inquiries), and
// the approvals that moved to Shipments → Managers (?tab=approvals: the count and the way there).
type PageTab = "cockpit" | "inquiries" | "approvals";
const PAGE_TABS: readonly PageTab[] = ["cockpit", "inquiries", "approvals"];

export function ManagersCockpit() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  // An admin or a manager came here for the approvals and sees nothing else of Warehouse Concept:
  // the page still opens on Approvals for them - it leads on to Shipments → Managers, where the
  // approvals are answered now - and what leads into the concept module is plain text.
  const managerOnly = isWarehouseManagerOnly(user);
  const linked = !managerOnly;
  const defaultTab: PageTab = managerOnly ? "approvals" : "cockpit";
  const asked = searchParams.get("tab");
  const tab: PageTab = PAGE_TABS.find((t) => t === asked) ?? defaultTab;
  const setTab = (next: PageTab) => router.replace(next === defaultTab ? pathname : `${pathname}?tab=${next}`);
  const { waiting: inquiriesWaiting } = useWarehouseInquiries();
  const { waiting: officesWaiting, isError: officesFailed, isLoading: officesLoading } = useCustomsOfficeApprovals();
  const { waiting: documentsWaiting, isError: documentsFailed, isLoading: documentsLoading } = useDocumentChangeApprovals();
  const approvalsWaiting = officesWaiting + documentsWaiting;
  const { cockpit, isLoading, isError } = useManagersCockpit();
  const [openCard, setOpenCard] = useState<CockpitCardKey | null>(null);

  // A row opens its record; its Warehouse ref is a link, so the keyboard reaches it too.
  const rowProps = (r: CockpitRow) =>
    linked
      ? {
          onClick: (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest("a")) return;
            router.push(rowHref(r));
          },
        }
      : {};

  const rowKey = (r: CockpitRow) => `${r.kind}:${r.id}`;

  const renderCard = (key: CockpitCardKey) => (
    <CockpitCard<CockpitRow>
      card={CARDS[key]}
      look={CARD_LOOK}
      list={cockpit?.[key]}
      isLoading={isLoading}
      isError={isError}
      loadFailed="Could not load the warehouse."
      onShowAll={() => setOpenCard(key)}
      columns={cardColumns(linked)}
      rowKey={rowKey}
      rowClassName={linked ? "cursor-pointer" : undefined}
      onRow={rowProps}
    />
  );

  const openList = openCard ? cockpit?.[openCard] : undefined;

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
        <PageHeader
          title="Managers"
          breadcrumb={
            linked ? (
              <Link href="/warehouse-concept" className={LINK}>
                Warehouse Concept
              </Link>
            ) : (
              "Warehouse Concept"
            )
          }
          extra={
            <span className="flex items-center gap-3 text-[12px] text-slate-500">
              {cockpit && <span>Updated {PRAGUE_TIME.format(new Date(cockpit.asOf))} · Prague time</span>}
              {linked && (
                <Link href="/warehouse-concept?tab=reports" className={LINK}>
                  Reports
                </Link>
              )}
            </span>
          }
        />

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as PageTab)}
          className="[&>.ant-tabs-nav]:!mb-0"
          items={[
            { key: "cockpit", label: "Cockpit" },
            {
              key: "inquiries",
              label: (
                <span className="whitespace-nowrap">
                  Quote inquiries
                  {inquiriesWaiting > 0 && (
                    <Badge tone="a" className="ml-1.5">
                      {inquiriesWaiting}
                    </Badge>
                  )}
                </span>
              ),
            },
            // No count on the tab: nothing there is for the warehouse manager to decide - they are
            // decided on Shipments → Managers, which the tab says and leads to (user council M16).
            { key: "approvals", label: "Approvals" },
          ]}
        />

        {tab === "inquiries" ? (
          <QuoteInquiries />
        ) : tab === "approvals" ? (
          <ApprovalsMoved waiting={approvalsWaiting} partial={officesFailed || documentsFailed} loading={officesLoading || documentsLoading} />
        ) : (
          <>
        <Tiles cockpit={cockpit} isLoading={isLoading} isError={isError} linked={linked} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderCard("urgent")}
          {renderCard("attention")}
        </div>

        {cockpit && (
          <>
            <HealthLine report={cockpit} linked={linked} />
            <DeliveryLine cockpit={cockpit} linked={linked} />
            <AuditLine cockpit={cockpit} linked={linked} />
          </>
        )}
          </>
        )}
      </div>

      <CockpitDialog<CockpitRow>
        card={openCard ? CARDS[openCard] : null}
        list={openList}
        onClose={() => setOpenCard(null)}
        columns={dialogColumns(linked)}
        rowKey={rowKey}
        rowClassName={linked ? "cursor-pointer" : undefined}
        onRow={rowProps}
      />
    </div>
  );
}
