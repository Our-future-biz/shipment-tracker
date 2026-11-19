import { userByEmail, type CompanyUser } from "../../../lib/personPick";
import { personEmail } from "./shipmentEditRule";

// Handled By and Holiday Cover name a user by e-mail; beside each the shipment keeps that user's id
// (Council Outlay 11, "Handled By linked to a user"), so a user who has left is still known as one
// who was. The pure rules: services/shipment.service sets the ids on every write of the e-mails,
// services/shipmentUserLinks.service fills them for older rows (daily cron). Tested in
// tests/userLinks.test.ts.

/** The person fields that keep their user's id, and the column it is kept in. */
export const USER_ID_FIELDS = {
  personInCharge: "personInChargeUserId",
  holidayCover: "holidayCoverUserId",
} as const;
export type LinkedPersonField = keyof typeof USER_ID_FIELDS;
export type UserIdField = (typeof USER_ID_FIELDS)[LinkedPersonField];

/** The id columns: written only by the server, never from a request, and no line in the job's history (the e-mail beside it has one). */
export const USER_ID_COLUMNS: ReadonlySet<string> = new Set(Object.values(USER_ID_FIELDS));

/** The active user of the company a stored person value names (an e-mail, an old "e-mail — Name" too); null for nobody or a name that is no user. */
export function linkedUser(value: string | null | undefined, users: readonly CompanyUser[]): CompanyUser | null {
  const email = personEmail(value);
  return email ? userByEmail(email, [...users]) : null;
}

/** Whether a stored person value could name a user at all: an e-mail, not empty and not an old free-typed name. */
export const mayNameUser = (value: string | null | undefined): boolean => personEmail(value).includes("@");

/**
 * What the backfill writes for one stored value of a person field, or undefined to leave the id as
 * it is: the id of the active user it names; null for an empty field (nobody, no id). A value that
 * names no active user leaves the id alone - it may be the id of a user who has left since, which a
 * write set while they were one, or of one whose e-mail changed.
 */
export function backfilledId(value: string, users: readonly CompanyUser[]): string | null | undefined {
  if (!personEmail(value)) return null;
  return linkedUser(value, users)?.id;
}

/** One stored value of a person field and the id every live job holding it should carry. */
export interface UserLinkPlan {
  field: LinkedPersonField;
  /** The stored value, exactly as it is stored: only rows still holding it are written. */
  value: string;
  userId: string | null;
}

/** The writes of the backfill for the distinct stored values of the two fields; values that leave the id alone give none. */
export function planUserLinks(values: readonly { field: LinkedPersonField; value: string }[], users: readonly CompanyUser[]): UserLinkPlan[] {
  return values.flatMap(({ field, value }) => {
    const userId = backfilledId(value, users);
    return userId === undefined ? [] : [{ field, value, userId }];
  });
}
