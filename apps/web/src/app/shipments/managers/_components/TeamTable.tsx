"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Dropdown } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import { canHandOverAll, canReplaceCover, handOverAllLabel, replaceCoverLabel } from "@/lib/managerActions";
import { Table } from "@/components/Table";
import type { ColumnsType } from "antd/es/table";
import { Pill } from "@/components/Pill";
import type { OpsCockpitFilter, OpsCockpitPerson } from "@/hooks/useShipmentsManagersCockpit";
import { CARD, CARD_BAR, CARD_TITLE, HINT, LINK } from "@/styles/ui";
import { usePeopleNames } from "@/app/shipments/_lib/usePeopleNames";
import { teamRows, type TeamRow } from "../_lib/cockpitTeam";
import { columnHead as head, figure } from "./CockpitParts";

interface TeamTableProps {
  /** The server's `people`; undefined until the answer is there. */
  people: readonly OpsCockpitPerson[] | undefined;
  /** The mode, direction and "My reports" on screen: what the figures are counted over, and what a row's link keeps - with what the Money tab's cards are narrowed to (`msignal`), which is that tab's to keep. */
  filter: OpsCockpitFilter & { msignal?: string | null };
  /** What the figures are counted over, in words: "all modes · Import". */
  scope: string;
  isLoading: boolean;
  isError: boolean;
  /** What the table says when the answer could not be loaded. */
  loadFailed: string;
  /** "Hand over all N active jobs…" on a person's row (X9): opens the hand-over of every active job they handle. Left out, no row offers it. */
  onHandOverAll?: (row: TeamRow) => void;
  /** "Replace as Holiday Cover on M jobs…" on a person's row (P12): opens the change of the cover on every active job they cover. */
  onReplaceCover?: (row: TeamRow) => void;
}

// A person's row's actions, behind "⋯" as a card row's are (RowMenu): hand over every active job they handle -
// the quiet ones too, which no card shows - and put somebody else in as Holiday Cover on the jobs they cover. Not
// on the jobs nobody handles: there is nobody to hand them over from. The row around it opens the Cockpit tab on a
// click: nothing clicked in here may reach it.
function TeamRowMenu({ row, onHandOverAll, onReplaceCover }: { row: TeamRow; onHandOverAll?: (row: TeamRow) => void; onReplaceCover?: (row: TeamRow) => void }) {
  const items = [
    ...(onHandOverAll && canHandOverAll(row) ? [{ key: "handOverAll", label: handOverAllLabel(row.active) }] : []),
    ...(onReplaceCover && canReplaceCover(row) ? [{ key: "replaceCover", label: replaceCoverLabel(row.covers) }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items, onClick: ({ key }) => (key === "replaceCover" ? onReplaceCover?.(row) : onHandOverAll?.(row)) }}>
        <Button type="text" size="small" icon={<EllipsisOutlined className="!text-[20px]" />} aria-label={`Actions for ${row.name}`} />
      </Dropdown>
    </span>
  );
}

// The "⋯" column's header: nothing to see, "Actions" for a screen reader.
const MENU_TITLE = <span className="sr-only">Actions</span>;

const COLUMNS: ColumnsType<TeamRow> = [
  {
    title: "Person",
    key: "person",
    render: (_: unknown, r) => (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {r.href ? (
          <Link href={r.href} title={r.nobody ? "Show the jobs nobody handles on the Cockpit tab" : `Show the jobs of ${r.name}${r.name !== r.key ? ` (${r.key})` : ""} on the Cockpit tab`} className={`font-semibold ${r.nobody ? "!text-red-600 hover:!underline" : LINK}`}>
            {r.name}
          </Link>
        ) : (
          <span className="font-semibold text-slate-900" title={r.nobody || r.name === r.key ? undefined : r.key}>
            {r.name}
          </span>
        )}
        {r.notUser && <Pill tone="red">not a user</Pill>}
        {r.away && (
          <Pill tone="amber" title="On an absence recorded under Away… (the user menu or Settings → Users); while it lasts, the absence's cover stands in on the jobs with no Holiday Cover">
            {r.away}
          </Pill>
        )}
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
  { title: head("Not touched", "Their jobs with no change, chat line, to-do, task tick or tracking event for 5 working days (air: 3) - a manager's nudge, dismissed cut-off or answer to a release request does not count"), key: "notTouched", width: 110, render: (_: unknown, r) => figure(r.notTouched) },
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
export function TeamTable({ people, filter, scope, isLoading, isError, loadFailed, onHandOverAll, onReplaceCover }: TeamTableProps) {
  const router = useRouter();
  const names = usePeopleNames();
  const rows = people ? teamRows(people, filter, names) : [];
  const columns: ColumnsType<TeamRow> =
    onHandOverAll || onReplaceCover
      ? [...COLUMNS, { title: MENU_TITLE, key: "menu", width: 48, align: "right", render: (_: unknown, r) => <TeamRowMenu row={r} onHandOverAll={onHandOverAll} onReplaceCover={onReplaceCover} /> }]
      : COLUMNS;
  return (
    <section aria-label="Team" className={`${CARD} overflow-clip`}>
      <div className={CARD_BAR}>
        <span className={CARD_TITLE}>Team</span>
        <span className="text-[13px] text-slate-500">active jobs · {scope}</span>
      </div>
      <Table<TeamRow>
        size="small"
        rowKey={(r) => r.key}
        loading={isLoading}
        dataSource={rows}
        columns={columns}
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
            // A link leads there itself; the "⋯" menu (drawn elsewhere in the document) keeps its clicks.
            if (!href || (e.target as HTMLElement).closest("a, button, .ant-dropdown")) return;
            router.push(href);
          },
        })}
      />
    </section>
  );
}
