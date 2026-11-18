import type { OpsCockpitPerson } from "@/hooks/useShipmentsManagersCockpit";
import { EVERYONE, NOBODY } from "./cockpitAddress";

// The people of Shipments → Managers: who the Handled By filter is picked from, and the Team line.
// Both come from the server's `people` - everyone named in Handled By on an active job of the
// chosen mode and direction, by e-mail in lower case, "" for the jobs nobody handles.

/** How a person is called: the e-mail, as Handled By stores it. */
export const personName = (handledBy: string): string => handledBy || "Nobody";

/**
 * Whether Handled By names somebody who is no longer a user. Never for "" (nobody is not a
 * person), and not when the users could not be read (isUser null): not known is not "no".
 */
export const isNotUser = (person: Pick<OpsCockpitPerson, "handledBy" | "isUser">): boolean => person.handledBy !== "" && person.isUser === false;

/** A person's figures on the Team line: "12 active · 3 urgent", and what they cover for others. */
export const personFigures = (person: Pick<OpsCockpitPerson, "active" | "urgent" | "covers">): string =>
  [`${person.active} active`, `${person.urgent} urgent`, person.covers > 0 ? `Holiday Cover on ${person.covers}` : ""].filter(Boolean).join(" · ");

/** The Team line's order: the server's (the most active first), with the jobs nobody handles last. */
export const teamOf = (people: readonly OpsCockpitPerson[]): OpsCockpitPerson[] => [...people.filter((p) => p.handledBy !== ""), ...people.filter((p) => p.handledBy === "")];

/** The value the Handled By filter takes for a person of `people`. */
export const filterValueOf = (person: Pick<OpsCockpitPerson, "handledBy">): string => person.handledBy || NOBODY;

/**
 * The Handled By select: Everyone, each person with their active jobs, Nobody. A person the
 * address names who is not among `people` (no active job of this mode and direction, or the answer
 * is not there yet) is listed too, so the select always shows who the page is narrowed to.
 */
export function handledByOptions(people: readonly OpsCockpitPerson[], handledBy: string | null): { value: string; label: string }[] {
  const named = people.filter((p) => p.handledBy !== "");
  const nobody = people.find((p) => p.handledBy === "");
  const listed = new Set([EVERYONE, NOBODY, ...named.map((p) => p.handledBy)]);
  const missing = handledBy && !listed.has(handledBy) ? [{ value: handledBy, label: handledBy }] : [];
  return [
    { value: EVERYONE, label: "Everyone" },
    ...named.map((p) => ({ value: p.handledBy, label: `${p.handledBy} · ${p.active} active${isNotUser(p) ? " · not a user" : ""}` })),
    ...missing,
    { value: NOBODY, label: nobody ? `Nobody · ${nobody.active} active` : "Nobody" },
  ];
}
