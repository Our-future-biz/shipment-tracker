// "Ask a manager to release" (Council Outlay 11, D16). The prepayment stop (lib/prepaymentStop) refuses a
// user's House BoL release and a user's Warehouse Released on a job on prepayment that is not paid; until now the
// user had to find a manager and have them do the release by hand. The user now asks from where they were
// refused, and a manager decides on Shipments → Managers (Approvals), with a reason either way.
//
// Approving releases nothing. The approved request is a PASS for that job and that release, good for
// RELEASE_PASS_VALID_DAYS: the next time the stop would refuse that release - whoever on the job makes it - the
// release goes through as the override it is, recorded as every override is (the override row, the history
// line, the Tracking note), with who asked and why and who approved and why as its reason; the pass is marked
// used in that same write turn, so it lets one release through, once. The release stays the releasing person's
// own act: the warehouse names the truck and the day, as always.
//
// Four eyes: whoever asked never decides their own request, a manager neither. When the job is released another
// way (it was paid, a manager released it with their own reason, the app's gate did) a request still waiting is
// closed - and so is an approved one nobody used: an old approval never lets a later release through.
// Pure; the services read and write.

import { businessDay } from "../../../lib/businessDate";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import type { ReleaseRequestWhat } from "../interfaces/interfaces";
import type { ReleaseKind } from "./prepaymentStop";

export const RELEASE_WHATS: readonly ReleaseRequestWhat[] = ["house_bol", "warehouse"];
export const isReleaseWhat = (value: string): value is ReleaseRequestWhat => (RELEASE_WHATS as readonly string[]).includes(value);

/** The stop's own name of each thing asked for. */
export const RELEASE_KIND: Record<ReleaseRequestWhat, ReleaseKind> = { house_bol: "house_bol", warehouse: "warehouse_released" };

/** What is asked for, in the app's words. */
export const RELEASE_WORDS: Record<ReleaseRequestWhat, string> = { house_bol: "House BoL release", warehouse: "Warehouse Released" };

export const MIN_RELEASE_REASON = 3;
/** As long as the override reason the release endpoints take. */
export const MAX_RELEASE_TEXT = 500;

/** How many days an approved request lets its release through, counted from the manager's decision. */
export const RELEASE_PASS_VALID_DAYS = 7;
const DAY_MS = 86_400_000;

/** The thing asked for, by the stop's name of the release it holds. */
export const WHAT_OF_KIND: Record<ReleaseKind, ReleaseRequestWhat> = { house_bol: "house_bol", warehouse_released: "warehouse" };

/** Until when an approved request can be used; null for one that is not approved. */
export function validUntil(request: { status: string; decidedAt: Date | null }): Date | null {
  return request.status === "approved" && request.decidedAt ? new Date(request.decidedAt.getTime() + RELEASE_PASS_VALID_DAYS * DAY_MS) : null;
}

/** The oldest decision a pass may have at `now` and still be good: what the reads and the "use" write bound by. */
export const passDecidedSince = (now: Date): Date => new Date(now.getTime() - RELEASE_PASS_VALID_DAYS * DAY_MS);

/** Whether the request lets its release through at `now`: approved, not used yet, and not older than the pass is good for. */
export function isUsable(request: { status: string; decidedAt: Date | null; usedAt: Date | null }, now: Date): boolean {
  const until = validUntil(request);
  return !!until && !request.usedAt && now.getTime() <= until.getTime();
}

/** What a closed request says where a manager's comment would be: the job was released another way - while it waited, or before its approval was used. */
export const CLOSED_COMMENT = "Released without it";

// The day on Prague's calendar, as the app's tags write a day: "25.11.".
const dm = (at: Date) => {
  const day = businessDay(at);
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
};

/** What somebody is told who asks again while an approved request can still be used. */
export const alreadyApproved = (until: Date): string => `A release was already approved for this job: release it now (valid until ${dm(until)})`;

/** Who decides a request: whoever the prepayment stop lets release with a reason - its own rule, not a second list. */
export const canDecideRelease = (role: string): boolean => canDecideQuoteInquiry(role);

export const ONLY_MANAGERS_DECIDE = "Only a manager answers these requests";
export const OWN_REQUEST = "You asked for this release yourself: another manager decides it";

/** Why this person may not decide this request, or null when they may: a manager, and not the one who asked. */
export function decideRefusal(request: { requestedById: string }, actor: { userID: string; role: string }): string | null {
  if (!canDecideRelease(actor.role)) return ONLY_MANAGERS_DECIDE;
  return request.requestedById === actor.userID ? OWN_REQUEST : null;
}

/**
 * Why there is nothing (left) to ask for, or null: the House BoL is released already, Warehouse
 * Released is set already - or the cargo was never received, which no manager's reason gets past
 * (lib/shipmentEditRule RELEASED_BEFORE_RECEIVED), so a request would only wait to be refused.
 */
export function nothingToRelease(
  shipment: { houseBolRelease: string; warehouseReleasedDate: string | null; warehouseReceivedDate: string | null },
  what: ReleaseRequestWhat,
): string | null {
  if (what === "house_bol") return shipment.houseBolRelease.trim() ? `The House BoL was already released (${shipment.houseBolRelease.trim()})` : null;
  if ((shipment.warehouseReleasedDate ?? "").trim()) return `Warehouse Released is already set (${shipment.warehouseReleasedDate})`;
  return (shipment.warehouseReceivedDate ?? "").trim() ? null : "The cargo was not received in the warehouse yet: fill in Warehouse Received first";
}

/**
 * The reason the release is recorded with (the override's reason, lib/prepaymentStop): who asked and why, who
 * approved and why. "Asked by Jan Novák: customer pays on Friday — approved by Eva Malá: agreed with the owner".
 */
export function approvedReason(request: { requestedByName: string; reason: string }, manager: string, comment: string): string {
  const asked = `Asked by ${request.requestedByName.trim() || "a user"}: ${request.reason.trim()}`;
  const approved = `approved by ${manager.trim() || "a manager"}`;
  return `${asked} — ${approved}${comment.trim() ? `: ${comment.trim()}` : ""}`;
}

/** The job's history field of a request asked and answered. */
export const RELEASE_REQUEST_FIELD = "releaseRequest";

/** The history line of a request: "House BoL release asked: customer pays on Friday". */
export const askedLine = (what: ReleaseRequestWhat, reason: string): string => `${RELEASE_WORDS[what]} asked: ${reason}`;

/** The history line of an answer: "House BoL release approved (asked by Jan Novák): agreed with the owner", "… rejected (asked by Jan Novák): not before the payment". */
export function answeredLine(request: { what: ReleaseRequestWhat; requestedByName: string }, approve: boolean, comment: string): string {
  const asker = request.requestedByName.trim();
  const head = `${RELEASE_WORDS[request.what]} ${approve ? "approved" : "rejected"}${asker ? ` (asked by ${asker})` : ""}`;
  return comment.trim() ? `${head}: ${comment.trim()}` : head;
}

/** The history line of a waiting request closed by a release made another way. */
export const closedLine = (what: ReleaseRequestWhat): string => `${RELEASE_WORDS[what]} request closed: released without it`;

/** The history line of an approval nobody used, closed by a release made another way. */
export const unusedLine = (what: ReleaseRequestWhat): string => `${RELEASE_WORDS[what]} approval closed unused: released without it`;
