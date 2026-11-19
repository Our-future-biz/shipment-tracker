import type { OpsCockpitFilter, OpsCockpitPerson } from "@/hooks/useShipmentsManagersCockpit";
import { OPS_MODES, shipmentsManagersHref } from "./cockpitAddress";
import { filterValueOf, isNotUser, personName } from "./cockpitPeople";

// The Team tab of Shipments → Managers: one row per person of the server's `people` - who is named
// in Handled By on an active job of the mode and direction on screen, the jobs nobody handles, and
// who only stands in as a Holiday Cover. The rows are in the order the server sends them and the
// table has no sorting: it says who carries what, it does not rank anybody (Council Outlay 11).
// A figure the server could not read is null and is shown as "–", never as 0 (D29).

/** A figure of the table: "–" for one that was not read (also for one an older answer does not have). */
export const teamFigure = (value: number | null | undefined): string => (value === null || value === undefined ? "–" : String(value));

/** "03.11." of a YYYY-MM-DD day; "" for anything else. */
export function shortDay(day: string | null | undefined): string {
  const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  return found ? `${found[3]}.${found[2]}.` : "";
}

/** A person's active jobs by how they travel, the modes with none left out: "Sea 8 · Air 3". */
export function modeSplit(byMode: Partial<OpsCockpitPerson["byMode"]> | null | undefined): string {
  return OPS_MODES.flatMap((m) => {
    const count = m.key === "all" ? 0 : (byMode?.[m.key] ?? 0);
    return count > 0 ? [`${m.label} ${count}`] : [];
  }).join(" · ");
}

/**
 * The mark of somebody away today (step 6, D12): "away until 28.11." - the last day of the absence
 * they are on. "" when they are not away, for the jobs nobody handles, and when the absences could
 * not be read (the server then sends null and names "who is away" as not known).
 */
export function awayText(person: Pick<OpsCockpitPerson, "handledBy"> & { awayUntil?: string | null }): string {
  if (person.handledBy === "") return "";
  const until = shortDay(person.awayUntil);
  return until ? `away until ${until}` : "";
}

/** What the Holiday Cover column says: on how many jobs, and since when the oldest of them stands. */
export function coversText(person: Pick<OpsCockpitPerson, "covers" | "coversSince">): string {
  const since = person.covers > 0 ? shortDay(person.coversSince) : "";
  return since ? `${person.covers} · since ${since}` : String(person.covers);
}

/** What a Team row's address keeps of the page's: the filters, and the Money tab's own narrowing. */
export type TeamPage = Pick<OpsCockpitFilter, "mode" | "direction" | "reports"> & { msignal?: string | null };

/**
 * Where a row leads: the Cockpit tab narrowed to the person, in the mode, direction and "My
 * reports" the Team tab is in. The signal the Cockpit's cards were last narrowed to does not go
 * along: the person's cards open whole. What the Money tab's cards are narrowed to (?msignal=) is
 * that tab's own and stays in the address. Null for somebody with no job of their own (a Holiday
 * Cover only): the cards go by Handled By, so narrowed to them they would be empty.
 */
export function teamRowHref(person: Pick<OpsCockpitPerson, "handledBy" | "active">, page: TeamPage): string | null {
  if (person.active <= 0) return null;
  return shipmentsManagersHref({ tab: "cockpit", mode: page.mode, direction: page.direction, reports: page.reports, handledBy: filterValueOf(person), msignal: page.msignal ?? null });
}

/** A row of the Team table, in the words and figures it shows. */
export interface TeamRow {
  /** The Handled By filter's value for the person: the e-mail, "nobody" for the jobs nobody handles. */
  key: string;
  name: string;
  /** The jobs nobody handles: not a person. */
  nobody: boolean;
  /** Handled By names somebody who is no longer a user (never said while the users are not known). */
  notUser: boolean;
  /** Stands in as a Holiday Cover only: no job of their own here. */
  coverOnly: boolean;
  highLoad: boolean;
  /** "away until 28.11."; "" when not away today (or not known). */
  away: string;
  active: number;
  /** "Sea 8 · Air 3"; "" for nobody's none. */
  modes: string;
  urgent: number;
  attention: number;
  /** null: not read. */
  todosLate: number | null;
  mentionsUnread: number | null;
  notTouched: number | null;
  covers: number;
  /** "4 · since 03.11." */
  coversText: string;
  /** The Cockpit tab narrowed to the person; null where there is nothing to narrow to. */
  href: string | null;
}

/** The Team table's rows, in the server's order. */
export function teamRows(people: readonly OpsCockpitPerson[], page: TeamPage): TeamRow[] {
  return people.map((p) => {
    const nobody = p.handledBy === "";
    return {
      key: filterValueOf(p),
      name: personName(p.handledBy),
      nobody,
      notUser: isNotUser(p),
      coverOnly: !nobody && p.active <= 0,
      // Never of "nobody": the jobs nobody handles are not a load somebody carries.
      highLoad: !nobody && p.highLoad === true,
      away: awayText(p),
      active: p.active,
      modes: modeSplit(p.byMode),
      urgent: p.urgent,
      attention: p.attention,
      // An answer from before step 3 has none of the three: not known, not 0.
      todosLate: p.todosLate ?? null,
      mentionsUnread: p.mentionsUnread ?? null,
      notTouched: p.notTouched ?? null,
      covers: p.covers,
      coversText: coversText(p),
      href: teamRowHref(p, page),
    };
  });
}
