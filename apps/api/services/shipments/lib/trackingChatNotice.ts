// A reported exception as a line in the shipment's chat, tagging its Person in Charge and Holiday
// Cover, so the reason is where the conversation is. Built here from the shipment as stored, so who
// is tagged is never what a browser said. Pure, so it is unit-tested.

import { userByEmail, type CompanyUser } from "../../../lib/personPick";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const personOf = (value: string) => value.split(" — ")[0]!.trim();

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

export function exceptionNotice(
  shipment: { personInCharge: string; holidayCover: string },
  users: readonly CompanyUser[],
  exception: { label: string; day: string; note: string },
  authorId: string,
): { message: string; tagged: CompanyUser[] } {
  const tagged: CompanyUser[] = [];
  for (const field of [shipment.personInCharge, shipment.holidayCover]) {
    const user = userByEmail(personOf(field), [...users]);
    if (user && user.id !== authorId && !tagged.includes(user)) tagged.push(user);
  }
  const lines = [`${exception.label} since ${czDay(exception.day)}: ${exception.note}`];
  if (tagged.length) lines.push(tagged.map((u) => `@${u.displayName || u.email}`).join(" "));
  return { message: lines.join("\n"), tagged };
}
