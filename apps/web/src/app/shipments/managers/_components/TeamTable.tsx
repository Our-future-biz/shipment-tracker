"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Pill } from "@/components/Pill";
import type { OpsCockpitFilter, OpsCockpitPerson } from "@/hooks/useShipmentsManagersCockpit";
import { CARD, CARD_BAR, CARD_TITLE, HINT, LINK } from "@/styles/ui";
import { teamFigure, teamRows, type TeamRow } from "../_lib/cockpitTeam";

interface TeamTableProps {
  /** The server's `people`; undefined until the answer is there. */
  people: readonly OpsCockpitPerson[] | undefined;
  /** The mode, direction and "My reports" on screen: what the figures are counted over, and what a row's link keeps. */
  filter: OpsCockpitFilter;
  /** What the figures are counted over, in words: "all modes · Import". */
  scope: string;
  isLoading: boolean;
  isError: boolean;
  /** What the table says when the answer could not be loaded. */
  loadFailed: string;
}

// A figure in the table: "–" when it was not read, quiet when it is none, in its colour when it counts something.
const figure = (value: number | null, hot = "text-slate-900") => (
  <span className={`tabular-nums ${value === null ? "text-slate-400" : value > 0 ? `font-semibold ${hot}` : "text-slate-400"}`} aria-label={value === null ? "Not known" : undefined}>
    {teamFigure(value)}
  </span>
);

const head = (label: string, hint: string) => <span title={hint}>{label}</span>;

const COLUMNS: ColumnsType<TeamRow> = [
  {
    title: "Person",
    key: "person",
    render: (_: unknown, r) => (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {r.href ? (
          <Link href={r.href} title={r.nobody ? "Show the jobs nobody handles on the Cockpit tab" : `Show the jobs of ${r.name} on the Cockpit tab`} className={`font-semibold ${r.nobody ? "!text-red-600 hover:!underline" : LINK}`}>
            {r.name}
          </Link>
        ) : (
          <span className="font-semibold text-slate-900">{r.name}</span>
        )}
        {r.notUser && <Pill tone="red">not a user</Pill>}
        {r.highLoad && (
          <Pill tone="amber" title="More active jobs than 1.5 times the team's median">
            high load
          </Pill>
        )}
        {r.coverOnly && (
          <Pill tone="slate" title="No job of their own here: named only as somebody's Holiday Cover">
            Holiday Cover only
          </Pill>
        )}
      </div>
    ),
  },
  {
    title: head("Active", "Active jobs with this person in Handled By, and how they travel"),
    key: "active",
    width: 190,
    render: (_: unknown, r) => (
      <div>
        {figure(r.active, r.nobody ? "text-red-600" : "text-slate-900")}
        {r.modes && <div className={HINT}>{r.modes}</div>}
      </div>
    ),
  },
  { title: head("Urgent", "Of those, the jobs on the URGENT card"), key: "urgent", width: 90, render: (_: unknown, r) => figure(r.urgent, "text-red-600") },
  { title: head("Attention", "Of those, the jobs on the ATTENTION card"), key: "attention", width: 100, render: (_: unknown, r) => figure(r.attention, "text-amber-600") },
  { title: head("To-dos late", "Open to-dos past their day on the jobs they handle"), key: "todosLate", width: 110, render: (_: unknown, r) => figure(r.todosLate) },
  {
    title: head("@mentions unread", "@mentions of this person not read for 4 office hours or longer, on the jobs they handle or cover"),
    key: "mentionsUnread",
    width: 150,
    render: (_: unknown, r) => figure(r.mentionsUnread),
  },
  { title: head("Not touched", "Their jobs with no change, chat line, to-do, task tick or tracking event for 5 working days (air: 3)"), key: "notTouched", width: 110, render: (_: unknown, r) => figure(r.notTouched) },
  {
    title: head("Holiday Cover", "Active jobs where this person stands in as the Holiday Cover, and since when the oldest of those covers stands"),
    key: "covers",
    width: 170,
    render: (_: unknown, r) => <span className={`tabular-nums ${r.covers > 0 ? "text-slate-900" : "text-slate-400"}`}>{r.coversText}</span>,
  },
];

// The Team tab: who carries what. One row per person named in Handled By on an active job of the
// mode and direction on screen, the jobs nobody handles, and who only stands in as a Holiday
// Cover - in the order the server sends them. No sorting and no ranking: the table is for seeing
// a load that needs sharing out, not for a league table. A row opens the Cockpit tab narrowed to
// the person; the name is a link, so the keyboard reaches it too.
export function TeamTable({ people, filter, scope, isLoading, isError, loadFailed }: TeamTableProps) {
  const router = useRouter();
  const rows = people ? teamRows(people, filter) : [];
  return (
    <section aria-label="Team" className={`${CARD} overflow-hidden`}>
      <div className={CARD_BAR}>
        <span className={CARD_TITLE}>Team</span>
        <span className="text-[13px] text-slate-500">active jobs · {scope}</span>
      </div>
      <Table<TeamRow>
        size="small"
        rowKey={(r) => r.key}
        loading={isLoading}
        dataSource={rows}
        columns={COLUMNS}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{
          // A failed load is not an empty team.
          emptyText: isError ? <span className="text-[13px] text-red-500">{loadFailed}</span> : <span className="text-[13px] text-slate-400">{isLoading ? "" : "Nobody handles an active job here."}</span>,
        }}
        rowClassName={(r) => (r.href ? "cursor-pointer" : "")}
        onRow={(r) => ({
          onClick: (e) => {
            const href = r.href;
            if (!href || (e.target as HTMLElement).closest("a")) return;
            router.push(href);
          },
        })}
      />
    </section>
  );
}
