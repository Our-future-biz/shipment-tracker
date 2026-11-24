// The chat line that tells people a cargo change took a Co-Loading box over its limit (Council
// Outlay 14, C4, D11). Apart from the rules (lib/coLoadingCargoChange) because it reads the company's
// users. Pure.

import { userByEmail, type CompanyUser } from "../../../lib/personPick";
import { overWords, sinceLinkedWords, type CargoNow, type Meter } from "./coLoadingCargoChange";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const personOf = (value: string) => value.split(" — ")[0]!.trim();

/**
 * The line in the changed shipment's chat when its cargo takes its sailing's box over the limit,
 * tagging the shipment's Person in Charge and Holiday Cover and whoever made the sailing (D11) -
 * never the one who made the change: they know. Built from what is stored, never from a browser.
 */
export function boxOverNotice(
  shipment: { jobNumber: string; personInCharge: string; holidayCover: string },
  sailing: { name: string; createdById: string | null },
  users: readonly CompanyUser[],
  box: { volume: Meter; weight: Meter },
  cargo: { now: CargoNow; change: CargoNow | null },
  authorId: string,
): { message: string; tagged: CompanyUser[] } {
  const tagged: CompanyUser[] = [];
  const add = (user: CompanyUser | null | undefined) => {
    if (user && user.id !== authorId && !tagged.includes(user)) tagged.push(user);
  };
  for (const field of [shipment.personInCharge, shipment.holidayCover]) add(userByEmail(personOf(field), [...users]));
  add(users.find((u) => u.id === sailing.createdById));
  const n = (v: number, decimals: number) => v.toLocaleString("en-US", { maximumFractionDigits: decimals });
  const change = sinceLinkedWords(cargo.change);
  const lines = [
    `Co-Loading sailing ${sailing.name} is now over its limit: ${overWords(box)}.`,
    `${shipment.jobNumber || "This shipment"} counts ${n(cargo.now.weightKg, 0)} kg · ${n(cargo.now.volumeCbm, 2)} cbm in the box${change ? ` (${change})` : ""}.`,
  ];
  if (tagged.length) lines.push(tagged.map((u) => `@${u.displayName || u.email}`).join(" "));
  return { message: lines.join("\n"), tagged };
}
