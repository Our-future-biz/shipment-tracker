import { isUncheckedPayload, overrideOfPayload } from "./releasePayment";

// What a voided stamp leaves on its shipment, in words (services/gateAdmin voidStamp): a void never changes the
// shipment back, so the record's "Shipment may need correcting" line and the manager's notice name what reached
// it - the date, and a release on prepayment recorded from the stamp (or its "Prepayment not checked" line), which
// stays in the shipment's history and on its Tracking tab.

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// An "override" row of the outbox that reached the shipment, in words: the release on prepayment recorded with its
// reason, or the "Prepayment not checked" line (P17).
function noteWords(payload: Record<string, string>): string {
  if (isUncheckedPayload(payload)) return `the line "Prepayment not checked" noted from this stamp`;
  const reason = overrideOfPayload(payload).reason.trim();
  return `the release on prepayment recorded from this stamp${reason ? ` (reason: ${clip(reason, 120)})` : ""}`;
}

/**
 * What a voided stamp left on the shipment, for the record's "Shipment may need correcting" line and the notice
 * the manager sees; null when it left nothing. `dateSet`: its date reached the shipment (or a stamp from before
 * the outbox wrote it); `sending`: it was on its way at the moment of the void; `notes`: the payloads of its
 * "override" rows sent - a release on prepayment recorded, or "Prepayment not checked".
 */
export function mayNeedCorrectingDetail(
  what: string,
  left: { dateSet: boolean; sending: boolean; notes: Record<string, string>[] },
): { detail: string; notice: string } | null {
  const notes = left.notes.map(noteWords);
  const stays = notes.length ? `${notes.join("; ")} ${notes.length > 1 ? "stay" : "stays"} in its history and on its Tracking tab` : "";
  if (left.sending || left.dateSet) {
    const date = left.sending
      ? `its ${what} was being sent from this stamp at the moment of the void and is not changed back — check it in Shipments`
      : `its ${what} was set from this stamp and is not changed back — correct it in Shipments if needed`;
    return {
      detail: stays ? `${date}; ${stays}` : date,
      notice: `The shipment is not changed back — its ${what} was (or is being) set from this stamp${stays ? `, and ${stays}` : ""}. Check it in Shipments and correct it if needed.`,
    };
  }
  if (!stays) return null;
  return {
    detail: `${stays} — correct it in Shipments if needed`,
    notice: `The shipment is not changed back — ${stays}. Check it in Shipments and correct it if needed.`,
  };
}
