// The message the warehouse's "Inform Operations" posts to the shipment's chat: the cargo was
// remeasured, the shipment's figures against the remeasured ones, and the shipment's Person in
// Charge and Holiday Cover tagged, so it reaches their notifications (a chat @mention).
import { splitPersonStamp } from "./personFields";

export interface CargoFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

export interface NoticeUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface RemeasureNotice {
  message: string;
  /** Who is tagged: the users the two fields name, each once. */
  mentionedUserIds: string[];
}

const figures = (f: CargoFigures) =>
  [
    `${f.colli > 0 ? f.colli : "—"} colli`,
    `${f.weightKg > 0 ? f.weightKg.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"} kg`,
    `${f.volumeCbm > 0 ? f.volumeCbm.toFixed(3) : "—"} CBM`,
  ].join(" · ");

/**
 * The notice for a shipment whose Person in Charge and Holiday Cover hold `personInCharge` and
 * `holidayCover` (users stored by e-mail). A field naming nobody, or someone who is no user of
 * the company, tags no one; the message still goes to the chat.
 */
export function remeasureNotice(
  people: { personInCharge?: string | null; holidayCover?: string | null },
  users: readonly NoticeUser[],
  shipment: CargoFigures,
  remeasured: CargoFigures,
): RemeasureNotice {
  const byEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]));
  const tagged: NoticeUser[] = [];
  for (const value of [people.personInCharge, people.holidayCover]) {
    const user = byEmail.get(splitPersonStamp(value).person.toLowerCase());
    if (user && !tagged.includes(user)) tagged.push(user);
  }
  const lines = [
    "Cargo has been remeasured by the warehouse.",
    `Shipment values: ${figures(shipment)}`,
    `Remeasured values: ${figures(remeasured)}`,
  ];
  // Written as the chat writes a tag: "@" and the name the @ list shows.
  if (tagged.length) lines.push(tagged.map((u) => `@${u.displayName || u.email}`).join(" "));
  return { message: lines.join("\n"), mentionedUserIds: tagged.map((u) => u.id) };
}
