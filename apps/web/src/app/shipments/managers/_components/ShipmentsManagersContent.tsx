"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Select, Spin, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Pill } from "@/components/Pill";
import { PillTabs } from "@/components/SectionCard";
import { SectionBackLink } from "@/components/SectionBackLink";
import { StatusBadge } from "@/components/StatusBadge";
import { CockpitCard, CockpitDialog, cockpitCards, type CockpitCardKey } from "@/components/cockpit/CockpitCard";
import { CockpitLine, CockpitNote, NOTE_TONES } from "@/components/cockpit/CockpitLine";
import { CockpitTiles, tileValue } from "@/components/cockpit/CockpitTiles";
import { useCustomsOfficeApprovals } from "@/hooks/useCustomsOfficeRequests";
import { useDocumentChangeApprovals } from "@/hooks/useDocumentChangeRequests";
import {
  useShipmentsManagersCockpit,
  type OpsCockpitDirection,
  type OpsCockpitFilter,
  type OpsCockpitMode,
  type OpsCockpitPerson,
  type OpsCockpitRow,
  type ShipmentsManagersCockpit as Cockpit,
} from "@/hooks/useShipmentsManagersCockpit";
import { useAuth } from "@/lib/auth/AuthContext";
import { EMPTY, HINT, LINK, PAGE_SUBTITLE, PAGE_TITLE, REF } from "@/styles/ui";
import { approvalsBadge } from "../_lib/approvalsBadge";
import {
  EVERYONE,
  OPS_DIRECTIONS,
  OPS_MODES,
  canOpenShipmentsManagers,
  directionOf,
  handledByOf,
  modeLabel,
  modeOf,
  rowHref,
  shipmentsManagersHref,
  tabOf,
  tileHref,
  type OpsTileKey,
  type ShipmentsManagersTab,
} from "../_lib/cockpitAddress";
import { filterValueOf, handledByOptions, isNotUser, personFigures, personName, teamOf } from "../_lib/cockpitPeople";
import { CustomsOfficeApprovals } from "./CustomsOfficeApprovals";

// Shipments → Managers (Council Outlay 11, step 1): what operations need from a manager today.
// Tiles over the company's active jobs, then what to act on today (URGENT) and within 48 hours
// (ATTENTION), the same anatomy as the Sales and Warehouse cockpits, and who handles how much.
// Everything comes from one server answer, worked out in Prague time by the rules the app already
// has, so the counts never disagree with each other. The page only reads - except Approvals, where
// a manager answers the requests to change a Customs Office or an approved document.
// For superadmins, admins and managers; anybody else is told it is not theirs.

// The cards, the tiles and the lines are the cockpits' shared parts (components/cockpit), in their
// own look; this page brings the jobs' wording, columns and links.
const CARDS = cockpitCards("jobs", "Nothing urgent in Operations.");

interface TileDef {
  key: OpsTileKey;
  label: string;
  /** What the tile counts, shown on hover. */
  hint: string;
  /** A second line on hover: where the jobs of a tile that leads nowhere are found. */
  note?: string;
  danger?: boolean;
}
// Where a tile leads is the list's business: tileHref (_lib/cockpitAddress).
const TILES: TileDef[] = [
  { key: "active", label: "Active jobs", hint: "Every job that is not invoiced or cancelled" },
  { key: "cutoffsDue", label: "Cut-offs due", hint: "A cut-off (Closing, VGM, SI, AMS, ISF) today or tomorrow, or an overdue filing", danger: true },
  { key: "noHandledBy", label: "Nobody in Handled By", hint: "Active jobs with nobody in Handled By", danger: true },
  // The Shipments list cannot tell who is a user, so this tile leads nowhere.
  { key: "handledByNotUser", label: "Handled By is not a user", hint: "Handled By names somebody who is not an active user of the company", note: "The jobs are on the URGENT card.", danger: true },
  { key: "bookingPending", label: "Booking not confirmed", hint: "Booking Confirmation still Pending" },
  { key: "etdEtaMoved", label: "ETA Moved", hint: "An ETD or ETA moved in the last 7 days", danger: true },
  // Free time is counted box by box from the clocks, which the Shipments list cannot filter by.
  { key: "freeTime", label: "Free time ending or over", hint: "A container's free time ending or over", note: "The jobs are on the cards below.", danger: true },
  { key: "customsUrgent", label: "Customs urgent", hint: "Customs priority Urgent, not released, the deadline within 24 hours or passed", danger: true },
  // Counted by the list's own rule (unbilled-arrivals), so the tile is the rows it opens.
  { key: "notReleased", label: "Arrived, not released for billing", hint: "Tax date reached (ATA, ATD or delivery) and the job is not in Billing yet" },
  { key: "openClaims", label: "Open claims", hint: "Active jobs with a claim" },
];
const dash = <span className={EMPTY}>—</span>;
const PRAGUE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const NOBODY_TEXT = "text-red-600 font-medium";

const jobLink = (r: OpsCockpitRow) => (
  <Link href={rowHref(r)} className={`${REF} font-semibold ${LINK}`}>
    {r.jobNumber || "No job number"}
  </Link>
);

// A job with no Freight Mode gets no chip.
const modeChip = (r: OpsCockpitRow) => {
  const label = modeLabel(r.mode);
  return label ? <Pill tone="slate">{label}</Pill> : null;
};

const tagList = (r: OpsCockpitRow) => (
  <div className="flex flex-wrap gap-1.5">
    {r.tags.map((t, i) => (
      <Pill key={i} tone={t.urgent ? "red" : "amber"} className="max-w-full !whitespace-normal break-words">
        {t.text}
      </Pill>
    ))}
  </div>
);

// In a card the mode and the status sit under the job number, the customer and Handled By under
// the signals; the dialog gives them columns.
const CARD_COLUMNS: ColumnsType<OpsCockpitRow> = [
  {
    title: "Internal Reference",
    key: "ref",
    width: 180,
    render: (_: unknown, r) => (
      <div className="flex flex-col items-start gap-1 min-w-0">
        {jobLink(r)}
        <span className="flex flex-wrap items-center gap-1.5 max-w-full">
          {modeChip(r)}
          {r.status && <StatusBadge status={r.status} className="max-w-full truncate" />}
        </span>
      </div>
    ),
  },
  {
    title: "Signals",
    key: "tags",
    render: (_: unknown, r) => (
      <div className="flex flex-col gap-1 min-w-0">
        {tagList(r)}
        <div className="text-[12px] text-slate-500 truncate">
          {r.customer && `${r.customer} · `}
          {/* The row's tag already says "Nobody in Handled By". */}
          {r.handledBy || <span className={NOBODY_TEXT}>Nobody</span>}
        </div>
      </div>
    ),
  },
];

const DIALOG_COLUMNS: ColumnsType<OpsCockpitRow> = [
  { title: "Internal Reference", key: "ref", width: 170, render: (_: unknown, r) => jobLink(r) },
  { title: "Customer", dataIndex: "customer", width: 200, render: (v: string) => v || dash },
  { title: "Mode", key: "mode", width: 80, render: (_: unknown, r) => modeChip(r) ?? dash },
  { title: "Trade Direction", dataIndex: "tradeDirection", width: 130, render: (v: string) => v || dash },
  {
    title: "Handled By",
    key: "handledBy",
    width: 230,
    render: (_: unknown, r) => (
      <div className="min-w-0">
        {r.handledBy || <span className={NOBODY_TEXT}>Nobody</span>}
        {r.holidayCover && <div className={HINT}>Holiday Cover: {r.holidayCover}</div>}
      </div>
    ),
  },
  { title: "Status", dataIndex: "status", width: 190, render: (v: string) => (v ? <StatusBadge status={v} /> : dash) },
  { title: "Signals", key: "tags", render: (_: unknown, r) => tagList(r) },
];

function Tiles({ cockpit, isLoading, isError, filter }: { cockpit: Cockpit | null; isLoading: boolean; isError: boolean; filter: OpsCockpitFilter }) {
  return (
    <CockpitTiles
      tiles={TILES.map((t) => ({
        key: t.key,
        label: t.label,
        // Not known is not zero: without the users nobody can be said to be none of them.
        value: tileValue(cockpit, { isLoading, isError }, ({ tiles }) => {
          const count = tiles[t.key];
          return count === null ? "–" : String(count);
        }),
        hot: t.danger && !!cockpit?.tiles[t.key],
        // Narrowed as the page is: mode, Trade Direction, Handled By.
        href: tileHref(t.key, filter),
        hint: t.note ? (
          <>
            {t.hint}
            <div>{t.note}</div>
          </>
        ) : (
          t.hint
        ),
      }))}
    />
  );
}

// Who handles how much: the people named in Handled By on the active jobs of the mode and
// direction on screen (not narrowed by the Handled By filter - a name here sets it). The jobs
// nobody handles come last, in red.
function TeamLine({ people, filter, onPick }: { people: OpsCockpitPerson[]; filter: OpsCockpitFilter; onPick: (handledBy: string) => void }) {
  const team = teamOf(people);
  if (team.length === 0) return null;
  const scope = [filter.mode === "all" ? "all modes" : modeLabel(filter.mode), filter.direction === "all" ? "" : OPS_DIRECTIONS.find((d) => d.value === filter.direction)?.label].filter(Boolean);
  return (
    <CockpitLine label={["Team", "active jobs", ...scope].join(" · ")}>
      {team.map((p) => {
        const nobody = p.handledBy === "";
        return (
          <span key={filterValueOf(p)} className={nobody ? "text-red-600" : undefined}>
            <button
              type="button"
              onClick={() => onPick(filterValueOf(p))}
              title={`Show only ${nobody ? "the jobs nobody handles" : `the jobs of ${p.handledBy}`}`}
              className={`p-0 border-none bg-transparent cursor-pointer font-semibold hover:underline ${nobody ? "text-red-600" : "text-slate-900"}`}
            >
              {personName(p.handledBy)}
            </button>{" "}
            {personFigures(p)}
            {isNotUser(p) && <span className="text-red-600"> · not a user</span>}
          </span>
        );
      })}
    </CockpitLine>
  );
}

// What keeps the figures from being whole: a read that stopped at its limit, and users that could
// not be read. Quiet when there is nothing to say.
function HealthLine({ cockpit }: { cockpit: Cockpit }) {
  const usersUnknown = cockpit.tiles.handledByNotUser === null;
  if (!cockpit.capped && !usersUnknown) return null;
  return (
    <CockpitNote tone={NOTE_TONES.amber}>
      {/* The server reads the newest 2,000 active jobs (COCKPIT_JOB_LIMIT). */}
      {cockpit.capped && <span>More than 2,000 active jobs: the counts cover the 2,000 newest, older jobs are left out</span>}
      {usersUnknown && <span>Users could not be read: who is no longer a user is not known</span>}
    </CockpitNote>
  );
}

// The frame the Shipments list has: the same padding, column width and title.
function Page({ extra, children }: { extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-slate-50 min-h-full px-4 sm:px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {/* Back to Shipments. */}
            <SectionBackLink className="mb-1" />
            <h1 className={PAGE_TITLE}>Managers</h1>
            <p className={`${PAGE_SUBTITLE} mt-0.5`}>What operations need from a manager today</p>
          </div>
          {extra}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ShipmentsManagersContent() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <Page>
        <Spin />
      </Page>
    );
  }
  // Nothing is asked of the server for anybody else: the cockpit and its approvals are not rendered.
  if (!canOpenShipmentsManagers(user)) {
    return (
      <Page>
        <Alert
          type="info"
          showIcon
          message="Shipments → Managers is for managers and admins."
          description={
            <Link href="/shipments" className={LINK}>
              Back to Shipments
            </Link>
          }
        />
      </Page>
    );
  }
  return <ShipmentsManagersCockpit />;
}

function ShipmentsManagersCockpit() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The tab (?tab=approvals) and the three filters (?mode=, ?direction=, ?handledBy=) live in the
  // address, so they survive a reload and a link can name them. The filters stay when the tab changes.
  const tab = tabOf(searchParams.get("tab"));
  const filter: OpsCockpitFilter = {
    mode: modeOf(searchParams.get("mode")),
    direction: directionOf(searchParams.get("direction")),
    handledBy: handledByOf(searchParams.get("handledBy")),
  };
  const go = (next: Partial<OpsCockpitFilter> & { tab?: ShipmentsManagersTab }) => router.replace(shipmentsManagersHref({ tab, ...filter, ...next }), { scroll: false });
  const { cockpit, people, isLoading, isError } = useShipmentsManagersCockpit(filter, tab === "cockpit");
  // Both queues are counted on their tab, whichever tab is open; one that could not be read is
  // not counted as empty.
  const offices = useCustomsOfficeApprovals();
  const documents = useDocumentChangeApprovals();
  const approvalsWaiting = approvalsBadge([offices, documents]);
  const [openCard, setOpenCard] = useState<CockpitCardKey | null>(null);

  // A row opens its shipment; its job number is a link, so the keyboard reaches it too.
  const rowProps = (r: OpsCockpitRow) => ({
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("a")) return;
      router.push(rowHref(r));
    },
  });

  const rowKey = (r: OpsCockpitRow) => r.id;

  const renderCard = (key: CockpitCardKey) => (
    <CockpitCard<OpsCockpitRow>
      card={CARDS[key]}
      list={cockpit?.[key]}
      isLoading={isLoading}
      isError={isError}
      loadFailed="Could not load Operations."
      onShowAll={() => setOpenCard(key)}
      columns={CARD_COLUMNS}
      rowKey={rowKey}
      rowClassName="cursor-pointer"
      onRow={rowProps}
    />
  );

  const openList = openCard ? cockpit?.[openCard] : undefined;

  return (
    <Page extra={tab === "cockpit" && cockpit && <span className="text-xs text-slate-500">Updated {PRAGUE_TIME.format(new Date(cockpit.asOf))} · Prague time</span>}>
      <Tabs
        activeKey={tab}
        onChange={(k) => go({ tab: k as ShipmentsManagersTab })}
        className="[&>.ant-tabs-nav]:!mb-0"
        items={[
          { key: "cockpit", label: "Cockpit" },
          {
            key: "approvals",
            label: (
              <span className="whitespace-nowrap">
                Approvals
                {approvalsWaiting !== null && (
                  <Pill tone="amber" aria-label={approvalsWaiting === "–" ? "Count unavailable" : `${approvalsWaiting} waiting`} className="ml-1.5 tabular-nums">
                    {approvalsWaiting}
                  </Pill>
                )}
              </span>
            ),
          },
        ]}
      />

      {tab === "approvals" ? (
        // A request has no filter of its own: every one waiting is listed.
        <CustomsOfficeApprovals />
      ) : (
        <>
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
            <div role="group" aria-label="Mode">
              <PillTabs tabs={OPS_MODES} active={filter.mode} onChange={(mode: OpsCockpitMode) => go({ mode })} />
            </div>
            <span className="flex items-center gap-2">
              <span className={HINT}>Trade Direction</span>
              <Select<OpsCockpitDirection> aria-label="Trade Direction" className="w-32" value={filter.direction} onChange={(direction) => go({ direction })} options={OPS_DIRECTIONS} />
            </span>
            <span className="flex items-center gap-2 w-full sm:w-auto min-w-0">
              <span className={`${HINT} shrink-0`}>Handled By</span>
              <Select<string>
                aria-label="Handled By"
                className="flex-1 min-w-0 sm:flex-none sm:w-80"
                showSearch
                optionFilterProp="label"
                value={filter.handledBy ?? EVERYONE}
                onChange={(value) => go({ handledBy: value === EVERYONE ? null : value })}
                options={handledByOptions(people, filter.handledBy)}
              />
            </span>
          </div>

          <Tiles cockpit={cockpit} isLoading={isLoading} isError={isError} filter={filter} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderCard("urgent")}
            {renderCard("attention")}
          </div>

          {cockpit && (
            <div className="flex flex-col gap-2">
              <TeamLine people={cockpit.people} filter={filter} onPick={(handledBy) => go({ handledBy })} />
              <HealthLine cockpit={cockpit} />
            </div>
          )}
        </>
      )}

      <CockpitDialog<OpsCockpitRow>
        card={openCard ? CARDS[openCard] : null}
        list={openList}
        onClose={() => setOpenCard(null)}
        columns={DIALOG_COLUMNS}
        rowKey={rowKey}
        rowClassName="cursor-pointer"
        onRow={rowProps}
      />
    </Page>
  );
}
