import { APIError } from "encore.dev/api";
import { matchUser, userByEmail, type CompanyUser } from "../../../lib/personPick";

// A person on a shipment is a user of the company, recorded by their e-mail (owner decision,
// 26 Oct 2026). The pure rules for the fields a person is picked in and for the stamps that say
// who did something; the shipment service loads the users.

/** The fields a person is picked in, with the label the form shows them under. */
export const PERSON_FIELDS = {
  personInCharge: "Person In Charge",
  holidayCover: "Holiday Cover",
  salesPerson: "Sales Person",
  switchBolApprovedBy: "Switch BoL Approved By",
} as const;

/** Between who and when in a stamp ("jan@firma.cz — 26. 10. 2026 9:15:00"), as lib/fieldDefaults writes it. */
const STAMP_SEPARATOR = " — ";
/** How a road job made by Trucking names who made it ("Trucking · jan@firma.cz"). */
export const TRUCKING_PREFIX = "Trucking · ";
/** Trucking itself and its service identity: no person, so nothing to match. */
const NOT_A_PERSON = new Set(["trucking", "trucking (system)"]);

/**
 * The time a stamp records, as lib/fieldDefaults writes it (cs-CZ: "26. 10. 2026 9:15:00"): the
 * date, then the time if any - nothing else, so no name can ride along after the e-mail.
 */
const STAMP_TIME = /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/;

/**
 * Approved By as a request may write it: nobody, a user's e-mail, or the stamp the credit
 * approval leaves ("<e-mail> — <when>") with a user's e-mail and only the time after it.
 * Stored with the e-mail lower-cased.
 */
export function requireApprovedBy(value: string, users: CompanyUser[]): string {
  const raw = value.trim();
  if (!raw) return "";
  const at = raw.indexOf(STAMP_SEPARATOR);
  const user = userByEmail(at < 0 ? raw : raw.slice(0, at), users);
  const when = at < 0 ? "" : raw.slice(at + STAMP_SEPARATOR.length).trim();
  if (!user || (at >= 0 && !STAMP_TIME.test(when))) {
    throw APIError.invalidArgument("Approved By: pick a user of the company (by e-mail)");
  }
  return at < 0 ? user.email : `${user.email}${STAMP_SEPARATOR}${when}`;
}

/** The columns the backfill turns names into e-mails in: the person fields and the stamps. */
export const PEOPLE_COLUMNS = [...(Object.keys(PERSON_FIELDS) as (keyof typeof PERSON_FIELDS)[]), "createdBy", "approvedBy", "houseBolRelease"] as const;
export type PeopleColumn = (typeof PEOPLE_COLUMNS)[number];
export type ShipmentPeople = { id: string } & Record<PeopleColumn, string>;

/** Where the person sits in a stored value: the value is `prefix + name + suffix`. */
interface NamedIn {
  prefix: string;
  name: string;
  suffix: string;
}

/**
 * The person a stored value names, or null when it names nobody: empty, a stamp with no name
 * (just the time), or Trucking itself. Created By reads "<when> — <who>" (a road job
 * "Trucking · <who>"); Approved By and House BoL Release read "<who> — <when>"; a value without
 * the separator is a name typed by hand.
 */
export function personIn(field: PeopleColumn, value: string): NamedIn | null {
  if (!value.trim()) return null;
  let named: NamedIn = { prefix: "", name: value.trim(), suffix: "" };
  const at = value.indexOf(STAMP_SEPARATOR);
  if (field === "createdBy") {
    if (value.startsWith(TRUCKING_PREFIX)) named = { prefix: TRUCKING_PREFIX, name: value.slice(TRUCKING_PREFIX.length).trim(), suffix: "" };
    else if (at >= 0) named = { prefix: value.slice(0, at + STAMP_SEPARATOR.length), name: value.slice(at + STAMP_SEPARATOR.length).trim(), suffix: "" };
  } else if ((field === "approvedBy" || field === "houseBolRelease") && at >= 0) {
    named = { prefix: "", name: value.slice(0, at).trim(), suffix: value.slice(at) };
  }
  // A time alone has no letters; a name always has.
  if (!/\p{L}/u.test(named.name) || NOT_A_PERSON.has(named.name.toLowerCase())) return null;
  return named;
}

/** One stored value to replace: every live shipment of the company holding `from` in `field` gets `to`. */
export interface PeopleRewrite {
  field: PeopleColumn;
  from: string;
  to: string;
}

export interface PeoplePlan {
  /** Values that name a person, looked at. */
  checked: number;
  rewrites: PeopleRewrite[];
  /** Names that fit no user or more than one, by field, with how many values hold them. */
  unmatched: { field: string; value: string; count: number }[];
}

/**
 * What the backfill changes: each name that fits exactly one user (matchUser) becomes that user's
 * e-mail, the rest of a stamp kept as it is. An e-mail of a user in other letter case is
 * lower-cased; a value already right is left alone, so a second run finds nothing to do.
 */
export function planPeopleNormalize(rows: ShipmentPeople[], users: CompanyUser[]): PeoplePlan {
  let checked = 0;
  const rewrites = new Map<string, PeopleRewrite>();
  const unmatched = new Map<string, { field: string; value: string; count: number }>();
  for (const row of rows) {
    for (const field of PEOPLE_COLUMNS) {
      const value = row[field] ?? "";
      const named = personIn(field, value);
      if (!named) continue;
      checked++;
      const user = matchUser(named.name, users);
      if (!user) {
        const key = `${field}\n${named.name}`;
        const entry = unmatched.get(key) ?? { field, value: named.name, count: 0 };
        entry.count++;
        unmatched.set(key, entry);
        continue;
      }
      const to = named.prefix + user.email + named.suffix;
      if (to !== value) rewrites.set(`${field}\n${value}`, { field, from: value, to });
    }
  }
  return { checked, rewrites: [...rewrites.values()], unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count || a.field.localeCompare(b.field) || a.value.localeCompare(b.value)) };
}
