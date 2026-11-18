// A manager's nudge (Council Outlay 11, D17): a to-do on the job with a due date, and a line in the job's chat
// that tags its Handled By and Holiday Cover - the chat's @mention is what the bell already shows a person
// ("mentions"), stays unread until they open the chat, and is what Shipments → Managers counts as "@mention
// unread", so a nudge nobody looks at comes back to the manager. No e-mail, no new table. Built here from the
// job as stored, so who is tagged is never what a browser said. Pure; the service writes.

import { userByEmail, type CompanyUser } from "../../../lib/personPick";
import { personEmail } from "./shipmentEditRule";

export const NUDGE_NOBODY = "Name somebody in Handled By first";
/** The job names people, but none the nudge could reach: no user of the company, or only the manager nudging. */
export const NUDGE_NOBODY_TO_TELL = "Nobody on this job can be told: hand it over first";

/** The job's history field of a nudge. */
export const NUDGE_FIELD = "nudge";

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

export interface NudgeNotice {
  /** The chat line. */
  message: string;
  /** Who it tags: the job's Handled By and Holiday Cover that are users of the company - not the manager nudging. */
  tagged: CompanyUser[];
  /** The line in the job's history. */
  history: string;
}

/**
 * The chat line and history line of a nudge. `from` is the manager as the chat names people (their
 * name, else their e-mail). The one nudging is not tagged: nobody is told what they just did themselves.
 */
export function nudgeNotice(
  job: { personInCharge: string; holidayCover: string },
  users: readonly CompanyUser[],
  nudge: { text: string; dueDate: string; from: string },
  authorId: string,
): NudgeNotice {
  const tagged: CompanyUser[] = [];
  for (const field of [job.personInCharge, job.holidayCover]) {
    const user = userByEmail(personEmail(field), [...users]);
    if (user && user.id !== authorId && !tagged.includes(user)) tagged.push(user);
  }
  const due = `due ${czDay(nudge.dueDate)}`;
  const lines = [`To-do from ${nudge.from.trim() || "a manager"}: ${nudge.text} — ${due}`];
  if (tagged.length) lines.push(tagged.map((u) => `@${u.displayName || u.email}`).join(" "));
  const people = [job.personInCharge, job.holidayCover].map(personEmail).filter(Boolean);
  return { message: lines.join("\n"), tagged, history: `To-do for ${[...new Set(people)].join(", ")}: ${nudge.text} — ${due}` };
}
