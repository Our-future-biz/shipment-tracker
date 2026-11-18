"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Select, Spin, Switch, Tabs, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { XIcon } from "@phosphor-icons/react";
import { Pill } from "@/components/Pill";
import { PillTabs } from "@/components/SectionCard";
import { SectionBackLink } from "@/components/SectionBackLink";
import { StatusBadge } from "@/components/StatusBadge";
import { CockpitCard, cockpitCards, type CockpitCardDef, type CockpitCardKey } from "@/components/cockpit/CockpitCard";
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
import { HAND_OVER_MAX_JOBS, type CutoffKey } from "@/lib/managerActions";
import { useToast } from "@/lib/toast";
import { BTN, BTN_PRIMARY, BTN_SM, EMPTY, HINT, LABEL_TEXT, LINK, PAGE_SUBTITLE, PAGE_TITLE, REF } from "@/styles/ui";
import { approvalsBadge } from "../_lib/approvalsBadge";
import { cutoffsToast, handOverJob, handOverToast, hasActions, nudgeToast, type ActionToast, type CutoffsChange } from "../_lib/cockpitActions";
import {
  EVERYONE,
  LIST_TILES,
  MY_REPORTS_HINT,
  NO_LIST_FOR_MY_REPORTS,
  OPS_DIRECTIONS,
  OPS_MODES,
  canOpenShipmentsManagers,
  directionOf,
  handledByOf,
  modeLabel,
  modeOf,
  reportsOf,
  rowHref,
  shipmentsManagersHref,
  tabOf,
  tileHref,
  type ShipmentsManagersTab,
} from "../_lib/cockpitAddress";
import { filterValueOf, handledByOptions, isNotUser, personFigures, personName, teamOf } from "../_lib/cockpitPeople";
import {
  CARD_TAG_LIMIT,
  SIGNAL_FAMILIES,
  figureText,
  listWithSignal,
  loadFailedText,
  notKnownText,
  signalFigure,
  signalOf,
  tagsShown,
  windowWithSignal,
  type ShownList,
  type SignalFamily,
} from "../_lib/cockpitSignals";
import { AuditLine } from "./AuditLine";
import { CustomsOfficeApprovals } from "./CustomsOfficeApprovals";
import { DismissCutoffDialog } from "./DismissCutoffDialog";
import { HandOverDialog } from "./HandOverDialog";
import { JobsDialog } from "./JobsDialog";
import { NudgeDialog } from "./NudgeDialog";
import { ReleaseRequestApprovals, useReleaseRequestApprovals } from "./ReleaseRequestApprovals";
import { RowMenu } from "./RowMenu";
import { TeamTable } from "./TeamTable";

// Shipments → Managers (Council Outlay 11, steps 1 to 3): what operations need from a manager
// today. Cockpit: tiles over the company's active jobs, then what to act on today or the next
// working day (URGENT) and in the two working days after (ATTENTION), the same anatomy as the
// Sales and Warehouse cockpits, who handles how much, and the audit line. Team: the same people as
// a table - who carries what. Approvals: the requests a manager answers (to release a job before
// payment, to change a Customs Office or an approved document).
// The Cockpit and the Team tab come from one server answer, worked out in Prague time by the rules
// the app already has, so the counts never disagree with each other. From a row a manager hands the
// job over, nudges whoever handles it, or dismisses a missed cut-off (the dialogs are their own
// components; the server checks each again).
// For superadmins, admins and managers; anybody else is told it is not theirs.

// The cards, the tiles and the lines are the cockpits' shared parts (components/cockpit), in their
// own look; this page brings the jobs' wording, columns and links. Its windows are working days
// (D6), where the twins' are hours.
const CARDS = cockpitCards("jobs", "Nothing urgent in Operations.", undefined, {
  urgent: "today or the next working day",
  attention: "the two working days after",
  nothingToWatch: "Nothing to watch in the two working days after.",
});

// What an empty card says while the cards are narrowed to a signal: "nothing urgent" would be
// more than is known.
const EMPTY_WITH_SIGNAL: Record<CockpitCardKey, string> = {
  urgent: "No URGENT job with this signal.",
  attention: "No ATTENTION job with this signal.",
};

/** What the cards are narrowed to, as the chip and the dialog's title name it. */
const showingLabel = (signal: SignalFamily) => signal.showing ?? signal.label;

/** A card in the words of what it shows now: narrowed to a signal, and among how many when the server cut it. */
function cardShown(key: CockpitCardKey, signal: SignalFamily | null, list: ShownList | undefined): CockpitCardDef {
  const card = CARDS[key];
  if (!signal) return card;
  return {
    ...card,
    window: windowWithSignal(card.window, list),
    empty: EMPTY_WITH_SIGNAL[key],
    dialog: `${card.dialog} · ${showingLabel(signal)}`,
  };
}

const dash = <span className={EMPTY}>—</span>;
const PRAGUE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const NOBODY_TEXT = "text-red-600 font-medium";

const isMasterJob = (r: OpsCockpitRow) => r.kind === "masterJob";

// A job's number opens its shipment, a Master Job's MCZ number its page in Master Jobs.
const jobLink = (r: OpsCockpitRow) => (
  <Link href={rowHref(r)} className={`${REF} font-semibold ${LINK}`}>
    {r.jobNumber || (isMasterJob(r) ? "Master Job" : "No job number")}
  </Link>
);

// A Master Job has no shipment status: where a job shows its status, it says what it is.
const masterJobChip = <Pill tone="indigo">Master Job</Pill>;

// A job with no Freight Mode gets no chip.
const modeChip = (r: OpsCockpitRow) => {
  const label = modeLabel(r.mode);
  return label ? <Pill tone="slate">{label}</Pill> : null;
};

// A job can carry six or eight signals. A card's row shows the first few and how many more there
// are (their words on hover); the dialog shows them all. Narrowed to a signal, that signal's tags
// come first.
const tagList = (r: OpsCockpitRow, signal: SignalFamily | null, limit?: number) => {
  const { shown, more } = tagsShown(r.tags, signal, limit);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((t, i) => (
        <Pill key={i} tone={t.urgent ? "red" : "amber"} className="max-w-full !whitespace-normal break-words">
          {t.text}
        </Pill>
      ))}
      {more.length > 0 && (
        <Pill tone="slate" title={more.map((t) => t.text).join("\n")}>
          +{more.length} more
        </Pill>
      )}
    </div>
  );
};

/** A row's "⋯" menu, or nothing for a row that has none. */
type RowMenuOf = (row: OpsCockpitRow) => ReactNode;

// The "⋯" column's header: nothing to see - the column is as wide as its button - and "Actions"
// for a screen reader, which reads a column by its header.
const MENU_TITLE = <span className="sr-only">Actions</span>;

// In a card the mode and the status sit under the job number, the customer and Handled By under
// the signals; the dialog gives them columns. The row's actions come last in both.
const cardColumns = (signal: SignalFamily | null, menu: RowMenuOf): ColumnsType<OpsCockpitRow> => [
  {
    title: "Internal Reference",
    key: "ref",
    width: 180,
    render: (_: unknown, r) => (
      <div className="flex flex-col items-start gap-1 min-w-0">
        {jobLink(r)}
        <span className="flex flex-wrap items-center gap-1.5 max-w-full">
          {modeChip(r)}
          {isMasterJob(r) ? masterJobChip : r.status && <StatusBadge status={r.status} className="max-w-full truncate" />}
        </span>
      </div>
    ),
  },
  {
    title: "Signals",
    key: "tags",
    render: (_: unknown, r) => (
      <div className="flex flex-col gap-1 min-w-0">
        {tagList(r, signal, CARD_TAG_LIMIT)}
        <div className="text-[12px] text-slate-500 truncate">
          {r.customer && `${r.customer} · `}
          {/* The row's tag already says "Nobody in Handled By". */}
          {r.handledBy || <span className={NOBODY_TEXT}>Nobody</span>}
        </div>
      </div>
    ),
  },
  { title: MENU_TITLE, key: "menu", width: 44, align: "right", render: (_: unknown, r) => menu(r) },
];

const dialogColumns = (signal: SignalFamily | null, menu: RowMenuOf): ColumnsType<OpsCockpitRow> => [
  { title: "Internal Reference", key: "ref", width: 170, render: (_: unknown, r) => jobLink(r) },
  // The reasons come right after the reference, so they are on screen without scrolling sideways.
  // The dialog's table is as wide as its content: without a width of their own, a job's six or
  // eight signals would lie in one line and push the table far to the side.
  { title: "Signals", key: "tags", render: (_: unknown, r) => <div className="w-[460px]">{tagList(r, signal)}</div> },
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
  { title: "Status", key: "status", width: 190, render: (_: unknown, r) => (isMasterJob(r) ? masterJobChip : r.status ? <StatusBadge status={r.status} /> : dash) },
  // Kept in sight while the table is scrolled sideways.
  { title: MENU_TITLE, key: "menu", width: 48, align: "right", fixed: "right", render: (_: unknown, r) => menu(r) },
];

// The tiles' box is the app's button, as CockpitTiles draws its own; a signal tile that is on
// wears the colours of a chip that is on (CHIP_ON).
const SIGNAL_TILE = `${BTN} !text-slate-700 hover:!text-slate-900`;
const SIGNAL_TILE_ON = "!border-indigo-500 !bg-indigo-50 hover:!bg-indigo-50";

interface TilesProps {
  cockpit: Cockpit | null;
  isLoading: boolean;
  isError: boolean;
  filter: OpsCockpitFilter;
  signal: SignalFamily | null;
  /** Narrows the cards to a family, or shows them whole (null). */
  onSignal: (signal: SignalFamily | null) => void;
}

// One look, two sorts, each under its name: a list tile opens the Shipments list the figure
// counts; a signal tile narrows the two cards on this page to the jobs it counts. A zero stays on
// screen - "none" is an answer - but is not red.
function Tiles({ cockpit, isLoading, isError, filter, signal, onSignal }: TilesProps) {
  const state = { isLoading, isError };
  return (
    <div className="flex flex-col gap-2">
      <TileGroup label="Lists" title={filter.reports === "mine" ? "Each counts jobs the Shipments list can show; with My reports on they do not open it" : "Each opens the Shipments list of the jobs it counts"}>
        <CockpitTiles
          tiles={LIST_TILES.map((t) => ({
            key: t.key,
            label: t.label,
            value: tileValue(cockpit, state, ({ tiles }) => String(tiles[t.key])),
            hot: t.danger && !!cockpit?.tiles[t.key],
            // Narrowed as the page is: mode, Trade Direction, Handled By. With "My reports" on the
            // list cannot follow, and the tile says why it leads nowhere.
            href: tileHref(t.key, filter),
            hint:
              filter.reports === "mine" ? (
                <>
                  {t.hint}
                  <div>{NO_LIST_FOR_MY_REPORTS}</div>
                </>
              ) : (
                t.hint
              ),
          }))}
        />
      </TileGroup>
      <TileGroup label="Signals" title="Each shows only the jobs it counts on the two cards below">
        <div className="flex items-center gap-2 flex-wrap">
          {SIGNAL_FAMILIES.map((family) => {
            const figure = cockpit ? signalFigure(family, cockpit) : null;
            const value = tileValue(figure, state, figureText);
            const on = signal?.key === family.key;
            return (
              <Tooltip
                key={family.key}
                mouseEnterDelay={0.4}
                title={
                  <>
                    {family.hint}
                    {family.note && <div>{family.note}</div>}
                    <div>{on ? "Click again to show every job." : "Click to show only these jobs on the cards."}</div>
                  </>
                }
              >
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${family.label}: ${value}`}
                  onClick={() => onSignal(on ? null : family)}
                  className={`${SIGNAL_TILE} ${on ? SIGNAL_TILE_ON : ""}`}
                >
                  <span className="font-medium">{family.label}:</span>
                  <span className={`font-bold tabular-nums ${figure?.count ? "text-red-600" : "text-slate-900"}`}>{value}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </TileGroup>
    </div>
  );
}

function TileGroup({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={`${label}: ${title}`} className="flex flex-col sm:flex-row sm:items-start gap-x-3 gap-y-1">
      {/* As high as a tile, so the name sits on the first row's line. */}
      <span title={title} className={`${LABEL_TEXT} !text-slate-500 shrink-0 sm:w-14 sm:h-8 flex items-center`}>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// What the cards are narrowed to, and the way out: the chip of the Shipments list's own filters.
function SignalChip({ signal, onClear }: { signal: SignalFamily; onClear: () => void }) {
  const label = showingLabel(signal);
  return (
    <div role="group" aria-label="Signal the cards are narrowed to" className="flex flex-wrap items-center gap-2">
      <span className={HINT}>Showing only:</span>
      <span className="inline-flex max-w-full items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg border border-indigo-200 bg-indigo-50 text-[12px] font-medium text-indigo-700">
        <span className="truncate">{label}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear filter ${label}`}
          title="Show every job"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <XIcon size={12} weight="bold" aria-hidden />
        </button>
      </span>
    </div>
  );
}

/** What the people's figures are counted over, in words: "all modes", "Sea · Import · my reports". */
const scopeOf = (filter: OpsCockpitFilter): string[] =>
  [
    filter.mode === "all" ? "all modes" : modeLabel(filter.mode),
    filter.direction === "all" ? "" : (OPS_DIRECTIONS.find((d) => d.value === filter.direction)?.label ?? ""),
    filter.reports === "mine" ? "my reports" : "",
  ].filter(Boolean);

// Who handles how much: the people named in Handled By on the active jobs of the mode and
// direction on screen (not narrowed by the Handled By filter - a name here sets it). The jobs
// nobody handles come last, in red. Who only stands in as a Holiday Cover is on the Team tab.
function TeamLine({ people, filter, onPick }: { people: OpsCockpitPerson[]; filter: OpsCockpitFilter; onPick: (handledBy: string) => void }) {
  const team = teamOf(people);
  if (team.length === 0) return null;
  return (
    <CockpitLine label={["Team", "active jobs", ...scopeOf(filter)].join(" · ")}>
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

// What keeps the figures from being whole: a read that stopped at its limit, and what could not be
// read - the users, the holiday calendar, a part of the signals. A part not read gives no signal,
// which is not the same as none (D29). Quiet when there is nothing to say.
function HealthLine({ cockpit }: { cockpit: Cockpit }) {
  const usersUnknown = cockpit.tiles.handledByNotUser === null;
  // An answer from before step 2 has neither field: nothing is claimed of it.
  const holidaysUnknown = cockpit.holidaysKnown === false;
  const notKnown = cockpit.notKnown ?? [];
  if (!cockpit.capped && !usersUnknown && !holidaysUnknown && notKnown.length === 0) return null;
  return (
    <CockpitNote tone={NOTE_TONES.amber}>
      {/* The server reads the newest 2,000 active jobs (COCKPIT_JOB_LIMIT). */}
      {cockpit.capped && <span>More than 2,000 active jobs: the counts cover the 2,000 newest, older jobs are left out</span>}
      {usersUnknown && <span>Users could not be read: who is no longer a user is not known</span>}
      {/* The words of the Shipments list's Needs Attention card (NeedsAttentionTable). */}
      {holidaysUnknown && <span>The company&apos;s holidays could not be read: working days skip weekends and public holidays only</span>}
      {notKnown.length > 0 && <span>Not known right now: {notKnownText(notKnown)}</span>}
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

/** What a manager is doing about a row, or about the rows ticked in the dialog: one dialog at a time. */
type RowAction =
  | { kind: "handOver"; rows: OpsCockpitRow[]; ticked: boolean }
  | { kind: "nudge"; row: OpsCockpitRow }
  // `cutoffs` empty: the dialog lists the dismissals that stand, each to be taken back.
  | { kind: "dismiss"; row: OpsCockpitRow; cutoffs: { key: CutoffKey; label: string }[] };

// Where a click on a row does not open the job: a link (it leads there itself), a button, the tick
// column of the dialog.
const NOT_THE_ROW = "a, button, input, label, .ant-table-selection-column";

function ShipmentsManagersCockpit() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  // The tab (?tab=team, ?tab=approvals), the filters (?mode=, ?direction=, ?handledBy=,
  // ?reports=mine) and the signal the cards are narrowed to (?signal=) live in the address, so they
  // survive a reload, a link can name them, and the way back from a job returns to the cards as
  // they were left. They stay when the tab or another of them changes.
  const tab = tabOf(searchParams.get("tab"));
  const filter: OpsCockpitFilter = {
    mode: modeOf(searchParams.get("mode")),
    direction: directionOf(searchParams.get("direction")),
    handledBy: handledByOf(searchParams.get("handledBy")),
    reports: reportsOf(searchParams.get("reports")),
  };
  const signal = signalOf(searchParams.get("signal"));
  const go = (next: Partial<OpsCockpitFilter> & { tab?: ShipmentsManagersTab; signal?: string | null }) =>
    router.replace(shipmentsManagersHref({ tab, ...filter, signal: signal?.key ?? null, ...next }), { scroll: false });
  const setSignal = (family: SignalFamily | null) => go({ signal: family?.key ?? null });
  // The Cockpit and the Team tab read the same answer: changing between them asks nothing new.
  const { cockpit, people, isLoading, isError, error, refetch } = useShipmentsManagersCockpit(filter, tab !== "approvals");
  const loadFailed = loadFailedText(error);
  // The three queues are counted on their tab, whichever tab is open; one that could not be read
  // is not counted as empty.
  const releases = useReleaseRequestApprovals();
  const offices = useCustomsOfficeApprovals();
  const documents = useDocumentChangeApprovals();
  const approvalsWaiting = approvalsBadge([releases, offices, documents]);
  const [openCard, setOpenCard] = useState<CockpitCardKey | null>(null);
  const [action, setAction] = useState<RowAction | null>(null);
  // The rows ticked in the open dialog, by their keys.
  const [ticked, setTicked] = useState<string[]>([]);

  // A row opens its shipment (a Master Job's row its Master Job); its number is a link, so the
  // keyboard reaches it too. The "⋯" menu keeps its own clicks to itself (RowMenu).
  const rowProps = (r: OpsCockpitRow) => ({
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(NOT_THE_ROW)) return;
      router.push(rowHref(r));
    },
  });

  // A shipment and a Master Job are numbered apart: the kind keeps their keys apart too.
  const rowKey = (r: OpsCockpitRow) => `${r.kind}:${r.id}`;

  // The cards as shown: whole, or narrowed to the signal over the rows the server sent. The tiles
  // and the Team line are not narrowed: they say what there is to pick from.
  const shown = (key: CockpitCardKey): ShownList | undefined => (cockpit ? listWithSignal(cockpit[key], signal) : undefined);

  const menu = (r: OpsCockpitRow) => (
    <RowMenu
      row={r}
      onHandOver={(row) => setAction({ kind: "handOver", rows: [row], ticked: false })}
      onNudge={(row) => setAction({ kind: "nudge", row })}
      onDismissCutoff={(row, cutoffs) => setAction({ kind: "dismiss", row, cutoffs })}
    />
  );
  const columns = cardColumns(signal, menu);

  const renderCard = (key: CockpitCardKey) => (
    <CockpitCard<OpsCockpitRow>
      card={cardShown(key, signal, shown(key))}
      list={shown(key)}
      isLoading={isLoading}
      isError={isError}
      loadFailed={loadFailed}
      onShowAll={() => setOpenCard(key)}
      columns={columns}
      rowKey={rowKey}
      rowClassName="cursor-pointer"
      onRow={rowProps}
    />
  );

  const openList = openCard ? shown(openCard) : undefined;
  // Ticked and still listed: a job that left the card after the answer was read again is no longer handed over.
  const tickedRows = (openList?.rows ?? []).filter((r) => hasActions(r) && ticked.includes(rowKey(r)));
  const closeDialog = () => {
    setOpenCard(null);
    setTicked([]);
  };

  // After an action: say what happened and read the answer again at once - the action's own hook
  // invalidates it too, this does not wait for that.
  const done = (said: ActionToast, wasTicked = false) => {
    if (said.tone === "success") toast.success(said.text);
    else toast.info(said.text);
    if (wasTicked) setTicked([]);
    setAction(null);
    void refetch();
  };

  const scope = scopeOf(filter).join(" · ");

  return (
    <Page extra={tab !== "approvals" && cockpit && <span className="text-xs text-slate-500">Updated {PRAGUE_TIME.format(new Date(cockpit.asOf))} · Prague time</span>}>
      <Tabs
        activeKey={tab}
        onChange={(k) => go({ tab: k as ShipmentsManagersTab })}
        className="[&>.ant-tabs-nav]:!mb-0"
        items={[
          { key: "cockpit", label: "Cockpit" },
          { key: "team", label: "Team" },
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
        // A request has no filter of its own: every one waiting is listed. The requests to
        // release before payment first: a job stands still until its request is answered.
        <div className="flex flex-col gap-4">
          <ReleaseRequestApprovals />
          <CustomsOfficeApprovals />
        </div>
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
            {/* The Team tab lists everybody: a person is picked there by a click on their row. */}
            {tab === "cockpit" && (
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
            )}
            <Tooltip mouseEnterDelay={0.4} title={MY_REPORTS_HINT}>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch size="small" aria-label="My reports" checked={filter.reports === "mine"} onChange={(on) => go({ reports: on ? "mine" : "all" })} />
                <span className={HINT}>My reports</span>
              </label>
            </Tooltip>
          </div>

          {tab === "team" ? (
            <TeamTable people={cockpit?.people} filter={filter} scope={scope} isLoading={isLoading} isError={isError} loadFailed={loadFailed} />
          ) : (
            <>
              <Tiles cockpit={cockpit} isLoading={isLoading} isError={isError} filter={filter} signal={signal} onSignal={setSignal} />

              {signal && <SignalChip signal={signal} onClear={() => setSignal(null)} />}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {renderCard("urgent")}
                {renderCard("attention")}
              </div>
            </>
          )}

          {cockpit && (
            <div className="flex flex-col gap-2">
              {/* Zeros everywhere would read as "my team has nothing": with nobody to count, say that instead. */}
              {filter.reports === "mine" && cockpit.people.length === 0 && (
                <CockpitNote>
                  <span>My reports: nobody who reports to you (Settings → Users, Reports to) handles or covers an active job here, and no job here names somebody who is no longer a user</span>
                </CockpitNote>
              )}
              {tab === "cockpit" && <TeamLine people={cockpit.people} filter={filter} onPick={(handledBy) => go({ handledBy })} />}
              {/* An answer with no audit line - none of it could be read - has none drawn: the line below says what is not known. */}
              {tab === "cockpit" && cockpit.audit && <AuditLine audit={cockpit.audit} />}
              <HealthLine cockpit={cockpit} />
            </div>
          )}
        </>
      )}

      <JobsDialog<OpsCockpitRow>
        card={openCard ? cardShown(openCard, signal, openList) : null}
        list={openList}
        onClose={closeDialog}
        columns={dialogColumns(signal, menu)}
        rowKey={rowKey}
        rowClassName="cursor-pointer"
        onRow={rowProps}
        selected={ticked}
        onSelect={setTicked}
        notSelectable={(r) => (hasActions(r) ? null : "A Master Job is not handed over from here")}
        toolbar={
          <>
            <button
              type="button"
              disabled={tickedRows.length === 0 || tickedRows.length > HAND_OVER_MAX_JOBS}
              onClick={() => setAction({ kind: "handOver", rows: tickedRows, ticked: true })}
              className={`${BTN_PRIMARY} ${BTN_SM}`}
            >
              Hand over selected ({tickedRows.length})…
            </button>
            <span className={HINT}>
              {tickedRows.length > HAND_OVER_MAX_JOBS ? `At most ${HAND_OVER_MAX_JOBS} jobs are handed over at once.` : "Tick the jobs to give to somebody else, or to set or clear their Holiday Cover."}
            </span>
          </>
        }
      />

      {/* The actions' dialogs, one at a time; over the list of all rows when it is open. */}
      {action?.kind === "handOver" && (
        <HandOverDialog
          open
          jobs={action.rows.map(handOverJob)}
          people={cockpit?.people ?? people}
          onClose={() => setAction(null)}
          onDone={(result) => done(handOverToast(result), action.ticked)}
        />
      )}
      {action?.kind === "nudge" && (
        <NudgeDialog
          open
          job={{ id: action.row.id, jobNumber: action.row.jobNumber, handledBy: action.row.handledBy }}
          onClose={() => setAction(null)}
          onDone={(result) => done(nudgeToast(action.row.jobNumber, result))}
        />
      )}
      {action?.kind === "dismiss" && (
        <DismissCutoffDialog
          open
          job={{ id: action.row.id, jobNumber: action.row.jobNumber }}
          cutoffs={action.cutoffs}
          onClose={() => setAction(null)}
          onDone={(what?: CutoffsChange) => done(cutoffsToast(action.row.jobNumber, what))}
        />
      )}
    </Page>
  );
}
