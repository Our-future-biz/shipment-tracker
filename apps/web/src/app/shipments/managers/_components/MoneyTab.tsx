"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, Tooltip } from "antd";
import { Table } from "@/components/Table";
import type { ColumnsType } from "antd/es/table";
import { Pill } from "@/components/Pill";
import { StatusBadge } from "@/components/StatusBadge";
import { CockpitCard, CockpitDialog, cockpitCards, type CockpitCardDef, type CockpitCardKey } from "@/components/cockpit/CockpitCard";
import { CockpitNote, NOTE_TONES } from "@/components/cockpit/CockpitLine";
import { tileValue } from "@/components/cockpit/CockpitTiles";
import { Amounts } from "@/components/finance/Amounts";
import type { OpsMoneyRow, ShipmentsManagersMoney as Money } from "@/hooks/useShipmentsManagersMoney";
import type { interfaces } from "@/lib/api";
import { CARD, CARD_BAR, CARD_TITLE, HINT, LABEL_TEXT, LINK, MODAL_TITLE, REF } from "@/styles/ui";
import { moneyRowHref } from "../_lib/cockpitAddress";
import {
  MONEY_FAMILIES,
  MONEY_SIGNAL_NOT_KNOWN,
  isMoneySignalNotKnown,
  moneyCard,
  moneyNotes,
  moneyPersonRows,
  moneySignalFigure,
  notYetInvoicedListHint,
  notYetInvoicedView,
  NOT_YET_INVOICED_HINT,
  NOT_YET_INVOICED_LIST_NOTE,
  PERSON_NOT_YET_INVOICED_HINT,
  type MoneyCard,
  type MoneyPage,
  type MoneyPersonRow,
} from "../_lib/cockpitMoney";
import { CARD_TAG_LIMIT, figureText, listWithSignal, type ShownList, type SignalFamily } from "../_lib/cockpitSignals";
import { NOBODY_TEXT, SignalChip, SignalTile, TileGroup, columnHead as head, dash, figure, modeChip, tagList } from "./CockpitParts";

// The Money tab of Shipments → Managers (Council Outlay 11, step 4): what the money of the active
// jobs - and of the jobs invoiced in the last 90 days whose money still asks for a look - asks of a manager. Top to bottom: the work not yet invoiced (per currency, never added
// across; the one CZK figure is the server's, with the rate it names), the money signals' tiles,
// the URGENT and ATTENTION cards (a job once, with all its money tags), each person's money, and
// what keeps the figures from being whole. Read-only: a row leads to the job's Costs Breakdown,
// where the money is put right; nothing is handed over, nudged or dismissed from here.
// The page's filters apply - mode, Trade Direction, Handled By, My reports - and the answer is the
// server's, kept there for five minutes: the page's "Updated" time says how fresh it is.

// The cockpits' cards, in the Money tab's words: its windows are not working days, and its
// dialogs are titled apart from the Cockpit's "URGENT jobs" - the same job can be on both.
const WORDS = cockpitCards("jobs", "Nothing urgent in the money.", undefined, {
  urgent: "money at risk now",
  attention: "to look at this week",
  nothingToWatch: "Nothing else to look at.",
});
const CARDS: Record<CockpitCardKey, CockpitCardDef> = {
  urgent: { ...WORDS.urgent, dialog: "URGENT · money" },
  attention: { ...WORDS.attention, dialog: "ATTENTION · money" },
};

type UnbilledJob = interfaces.OpsMoneyUnbilledJob;

// A job's number opens its shipment on Costs Breakdown.
const jobLink = (r: Pick<OpsMoneyRow, "id" | "jobNumber">) => (
  <Link href={moneyRowHref(r)} className={`${REF} font-semibold ${LINK}`}>
    {r.jobNumber || "No job number"}
  </Link>
);

// A job that reads Invoiced is no active job: it is listed for the money that still asks for a
// look (a cost after billing, an open estimate, a loss), and says so where an active job shows
// its status.
const invoicedChip = <Pill tone="slate">Invoiced</Pill>;
const statusChip = (r: Pick<OpsMoneyRow, "invoiced" | "status">, className?: string) => (r.invoiced ? invoicedChip : r.status ? <StatusBadge status={r.status} className={className} /> : null);

const handledBy = (r: Pick<OpsMoneyRow, "handledBy">) => r.handledBy || <span className={NOBODY_TEXT}>Nobody</span>;

// As the Cockpit's cards: the mode and the status under the job number, the customer and Handled
// By under the signals; the dialog gives them columns. A Money row has no actions.
const cardColumns = (signal: SignalFamily | null): ColumnsType<OpsMoneyRow> => [
  {
    title: "Internal Reference",
    key: "ref",
    width: 180,
    render: (_: unknown, r) => (
      <div className="flex flex-col items-start gap-1 min-w-0">
        {jobLink(r)}
        <span className="flex flex-wrap items-center gap-1.5 max-w-full">
          {modeChip(r)}
          {statusChip(r, "max-w-full truncate")}
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
          {handledBy(r)}
        </div>
      </div>
    ),
  },
];

const dialogColumns = (signal: SignalFamily | null): ColumnsType<OpsMoneyRow> => [
  { title: "Internal Reference", key: "ref", width: 170, render: (_: unknown, r) => jobLink(r) },
  // The reasons right after the reference, in a width of their own (as the Cockpit's dialog).
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
        {handledBy(r)}
        {r.holidayCover && <div className={HINT}>Holiday Cover: {r.holidayCover}</div>}
      </div>
    ),
  },
  { title: "Status", key: "status", width: 190, render: (_: unknown, r) => statusChip(r) ?? dash },
];

interface AnswerState {
  money: Money | null;
  isLoading: boolean;
  isError: boolean;
}


// One amount in its own currency: a box of its own, so no two read as one sum.
const AMOUNT_CHIP = "inline-flex items-center h-8 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-bold tabular-nums text-slate-900 whitespace-nowrap";

// Work not yet invoiced on the jobs counted - the active ones, and late charges on jobs that read
// Invoiced: selling lines still to bill, on no open invoice.
// One chip per currency; the CZK figure beside them is the server's, under the label it sends.
// Not read is "–" - never 0, and never an empty row of chips. A load that failed is said here in
// the words the cards and the table say it.
// "in 15 jobs" opens those jobs (user council M4) when the answer lists them.
function NotYetInvoiced({ money, isLoading, isError, loadFailed, onOpenJobs }: AnswerState & { loadFailed: string; onOpenJobs: () => void }) {
  const view = money ? notYetInvoicedView(money.tiles) : null;
  const listed = !!money?.notYetInvoicedList?.total;
  return (
    <section aria-label="Work not yet invoiced" className={`${CARD} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
      {/* The name can be focused, so the keyboard reaches what it explains as the mouse does. */}
      <Tooltip trigger={["hover", "focus"]} mouseEnterDelay={0.4} title={NOT_YET_INVOICED_HINT}>
        <span tabIndex={0} aria-description={NOT_YET_INVOICED_HINT} className={`${LABEL_TEXT} rounded outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}>
          Work not yet invoiced
        </span>
      </Tooltip>
      {!view ? (
        <span className={AMOUNT_CHIP} aria-label={isLoading ? "Loading" : "Not known"}>
          {isLoading ? "…" : "–"}
        </span>
      ) : view.chips === null ? (
        <>
          <span className={AMOUNT_CHIP} aria-label="Not known">
            –
          </span>
          <span className={HINT}>Invoicing could not be read</span>
        </>
      ) : view.chips.length === 0 ? (
        <span className={AMOUNT_CHIP}>0</span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          {view.chips.map((chip) => (
            <span key={chip} className={AMOUNT_CHIP}>
              {chip}
            </span>
          ))}
        </span>
      )}
      {view?.jobs &&
        (listed ? (
          <button type="button" onClick={onOpenJobs} className={`text-[13px] font-medium cursor-pointer bg-transparent border-0 p-0 ${LINK}`}>
            {view.jobs}
          </button>
        ) : (
          <span className="text-[13px] text-slate-700">{view.jobs}</span>
        ))}
      {view?.czk && (
        <span className="text-[13px] text-slate-700">
          <span className={HINT}>All in CZK:</span> <b className="tabular-nums text-slate-900">{view.czk.amount}</b> {view.czk.label}
        </span>
      )}
      {isError && !money && <span className="text-[13px] text-red-500">{loadFailed}</span>}
    </section>
  );
}

const UNBILLED_COLUMNS: ColumnsType<UnbilledJob> = [
  { title: "Internal Reference", key: "ref", width: 170, render: (_: unknown, r) => jobLink(r) },
  { title: "Customer", dataIndex: "customer", width: 220, render: (v: string) => (v ? <span className="block max-w-[220px] truncate" title={v}>{v}</span> : dash) },
  {
    title: "Handled By",
    key: "handledBy",
    width: 230,
    render: (_: unknown, r) => (
      <div className="min-w-0">
        {handledBy(r)}
        {r.holidayCover && <div className={HINT}>Holiday Cover: {r.holidayCover}</div>}
      </div>
    ),
  },
  { title: "Status", key: "status", width: 190, render: (_: unknown, r) => statusChip(r) ?? dash },
  {
    title: "Not yet invoiced",
    key: "amount",
    width: 170,
    align: "right",
    render: (_: unknown, r) => (
      <div className="tabular-nums font-semibold text-slate-900">
        <Amounts list={r.notYetInvoiced} />
      </div>
    ),
  },
];

// The jobs "Work not yet invoiced … in 15 jobs" counts, with what is left to bill on each, one amount per currency
// (D24). Read-only like the cards: a row opens the job on Costs Breakdown, where it is invoiced.
function NotYetInvoicedJobs({ list, open, onClose }: { list: interfaces.OpsMoneyUnbilledList | null | undefined; open: boolean; onClose: () => void }) {
  const router = useRouter();
  return (
    <Modal
      open={open && !!list}
      onCancel={onClose}
      title={
        list && (
          <div>
            <div className={MODAL_TITLE}>Work not yet invoiced</div>
            <div className={`${HINT} font-normal mt-0.5`}>{notYetInvoicedListHint(list)}</div>
          </div>
        )
      }
      width="min(1000px, calc(100vw - 48px))"
      footer={null}
      destroyOnHidden
    >
      <p className={`${HINT} mt-0 mb-2`}>{NOT_YET_INVOICED_LIST_NOTE}</p>
      <Table<UnbilledJob>
        size="small"
        rowKey={(r) => r.id}
        scroll={{ x: "max-content" }}
        dataSource={list?.rows ?? []}
        columns={UNBILLED_COLUMNS}
        pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
        rowClassName="cursor-pointer"
        onRow={(r) => ({
          onClick: (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest("a, button")) return;
            router.push(moneyRowHref(r));
          },
        })}
      />
    </Modal>
  );
}

const PEOPLE_COLUMNS: ColumnsType<MoneyPersonRow> = [
  {
    title: "Handled By",
    key: "person",
    render: (_: unknown, r) => (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {/* The same address as the row's click: replaced, so the way back leaves the page. */}
        <Link
          href={r.href}
          replace
          scroll={false}
          title={r.nobody ? "Show the money of the jobs nobody handles" : `Show the money of the jobs of ${r.name}`}
          className={`font-semibold ${r.nobody ? "!text-red-600 hover:!underline" : LINK}`}
        >
          {r.name}
        </Link>
        {r.notUser && <Pill tone="red">not a user</Pill>}
      </div>
    ),
  },
  {
    title: head("Not yet invoiced", PERSON_NOT_YET_INVOICED_HINT),
    key: "notYetInvoiced",
    width: 190,
    render: (_: unknown, r) =>
      r.notYetInvoiced === null ? (
        figure(null)
      ) : (
        <div className={`tabular-nums ${r.notYetInvoiced.length > 0 ? "font-semibold text-slate-900" : "text-slate-400"}`}>
          <Amounts list={r.notYetInvoiced} />
        </div>
      ),
  },
  {
    title: head("Jobs with a negative profit", "Profit below zero by Costs Breakdown's figures, at any stage"),
    key: "jobsAtLoss",
    width: 210,
    render: (_: unknown, r) => figure(r.jobsAtLoss, "text-red-600"),
  },
  { title: head("Estimates open", "Estimated buy lines with no supplier invoice yet, on their jobs"), key: "estimatesOpen", width: 130, render: (_: unknown, r) => figure(r.estimatesOpen) },
  {
    title: head("Supplier invoices waiting", "Supplier invoices of their jobs waiting for approval"),
    key: "supplierInvoicesWaiting",
    width: 190,
    render: (_: unknown, r) => figure(r.supplierInvoicesWaiting),
  },
  { title: head("Cost claims open", "Open cost claims on their jobs"), key: "costClaimsOpen", width: 140, render: (_: unknown, r) => figure(r.costClaimsOpen) },
];

interface PeopleProps {
  rows: MoneyPersonRow[];
  /** What the figures are counted over, in words: "all modes · Import". */
  scope: string;
  isLoading: boolean;
  isError: boolean;
  loadFailed: string;
}

// Each person's money: everybody named in Handled By on a job of the mode and direction on screen
// (not narrowed by the Handled By filter - a row sets it), in the server's order; who is no longer
// a user is the answer's own word. No sorting and no ranking (D27): it is for seeing where money
// waits, not a league table.
function MoneyPeople({ rows, scope, isLoading, isError, loadFailed }: PeopleProps) {
  const router = useRouter();
  return (
    <section aria-label="Team's money" className={`${CARD} overflow-clip`}>
      <div className={CARD_BAR}>
        <span className={CARD_TITLE}>Team</span>
        <span className="text-[13px] text-slate-500">money on their jobs · {scope}</span>
      </div>
      <Table<MoneyPersonRow>
        size="small"
        rowKey={(r) => r.key}
        loading={isLoading}
        dataSource={rows}
        columns={PEOPLE_COLUMNS}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{
          // A failed load is not an empty team.
          emptyText: isError ? <span className="text-[13px] text-red-500">{loadFailed}</span> : <span className="text-[13px] text-slate-400">{isLoading ? "" : "Nobody handles a job here."}</span>,
        }}
        rowClassName={(r) => `cursor-pointer ${r.picked ? "!bg-indigo-50" : ""}`}
        onRow={(r) => ({
          "aria-current": r.picked ? ("true" as const) : undefined,
          onClick: (e) => {
            if ((e.target as HTMLElement).closest("a")) return;
            router.replace(r.href, { scroll: false });
          },
        })}
      />
    </section>
  );
}

interface MoneyTabProps extends AnswerState {
  /** What the cards and the table say when the answer could not be loaded: the server's words when it refused, the page's plain line otherwise. */
  loadFailed: string;
  /** The page's filters and what each tab's cards are narrowed to: what a person's row keeps. */
  page: MoneyPage;
  /** What the figures are counted over, in words. */
  scope: string;
  /** The money family the cards are narrowed to (?msignal=). */
  signal: SignalFamily | null;
  /** Narrows the cards to a family, or shows them whole (null). */
  onSignal: (signal: SignalFamily | null) => void;
}

export function MoneyTab({ money, isLoading, isError, loadFailed, page, scope, signal, onSignal }: MoneyTabProps) {
  const router = useRouter();
  const [openCard, setOpenCard] = useState<CockpitCardKey | null>(null);
  const [jobsOpen, setJobsOpen] = useState(false);
  const state = { isLoading, isError };

  // The cards as shown: whole, or narrowed to the signal over the rows the server sent. The tiles
  // and the people are not narrowed: they say what there is to pick from.
  const shown = (key: CockpitCardKey): ShownList<OpsMoneyRow> | undefined => (money ? listWithSignal(money[key], signal) : undefined);
  // A card never says "0 / nothing" for what was not read (moneyCard).
  const card = (key: CockpitCardKey): MoneyCard<CockpitCardDef> => (money ? moneyCard(CARDS[key], key, signal, money.tiles, shown(key)) : { card: CARDS[key], countNotKnown: false });

  // A row opens the job on Costs Breakdown; its number is a link, so the keyboard reaches it too.
  const rowProps = (r: OpsMoneyRow) => ({
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("a, button")) return;
      router.push(moneyRowHref(r));
    },
  });
  const rowKey = (r: OpsMoneyRow) => r.id;
  const columns = cardColumns(signal);

  const renderCard = (key: CockpitCardKey) => {
    const { card: words, countNotKnown } = card(key);
    return (
      <CockpitCard<OpsMoneyRow>
        card={words}
        list={shown(key)}
        isLoading={isLoading}
        // The shared card has one way to show no count ("–") and say why in place of "nothing":
        // the way it shows a load that failed. Narrowed to a family that could not be judged, that
        // is what the card is.
        isError={isError || countNotKnown}
        loadFailed={countNotKnown ? MONEY_SIGNAL_NOT_KNOWN : loadFailed}
        onShowAll={() => setOpenCard(key)}
        columns={columns}
        rowKey={rowKey}
        rowClassName="cursor-pointer"
        onRow={rowProps}
      />
    );
  };

  const notes = money ? moneyNotes(money) : [];

  return (
    <>
      <NotYetInvoiced money={money} isLoading={isLoading} isError={isError} loadFailed={loadFailed} onOpenJobs={() => setJobsOpen(true)} />

      <TileGroup label="Signals" title="Each shows only the jobs it counts on the two cards below">
        <div className="flex items-center gap-2 flex-wrap">
          {MONEY_FAMILIES.map((family) => {
            const counted = money ? moneySignalFigure(family, money) : null;
            const on = signal?.key === family.key;
            return (
              <SignalTile
                key={family.key}
                family={family}
                value={tileValue(counted, state, figureText)}
                hot={!!counted?.count}
                on={on}
                onToggle={() => onSignal(on ? null : family)}
                // A family the server could not judge has no figure, and says why.
                notKnown={money && isMoneySignalNotKnown(family, money.tiles) ? MONEY_SIGNAL_NOT_KNOWN : undefined}
              />
            );
          })}
        </div>
      </TileGroup>

      {signal && <SignalChip signal={signal} onClear={() => onSignal(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderCard("urgent")}
        {renderCard("attention")}
      </div>

      {/* Directly under the cards, as on the Cockpit: what keeps the figures from being whole is read before the people's. */}
      <div className="flex flex-col gap-2 empty:hidden">
        {/* Zeros everywhere would read as "my team's money is in order": with nobody to count, say that instead. */}
        {money && page.reports === "mine" && money.people.length === 0 && (
          <CockpitNote>
            <span>My reports: nobody who reports to you (Settings → Users, Reports to) handles a job here, and no job here names somebody who is no longer a user</span>
          </CockpitNote>
        )}
        {/* A part not read gives no figure and no signal, which is not the same as none (D29). */}
        {notes.length > 0 && (
          <CockpitNote tone={NOTE_TONES.amber}>
            {notes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </CockpitNote>
        )}
      </div>

      <MoneyPeople
        rows={money ? moneyPersonRows(money.people, page) : []}
        scope={scope}
        isLoading={isLoading}
        isError={isError}
        loadFailed={loadFailed}
      />

      <NotYetInvoicedJobs list={money?.notYetInvoicedList} open={jobsOpen} onClose={() => setJobsOpen(false)} />

      <CockpitDialog<OpsMoneyRow>
        card={openCard ? card(openCard).card : null}
        list={openCard ? shown(openCard) : undefined}
        onClose={() => setOpenCard(null)}
        columns={dialogColumns(signal)}
        rowKey={rowKey}
        rowClassName="cursor-pointer"
        onRow={rowProps}
      />
    </>
  );
}
