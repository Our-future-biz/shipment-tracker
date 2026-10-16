import type { PublicTransportOrder } from "@/hooks/useTruckingConsignments";

// Pure helpers of the haulier's public transport-order page (/haulier/order/<token>): Czech and
// English words, what the haulier may do now, the checks of its two forms. Tested in publicOrder.test.ts.

export interface BiText {
  cs: string;
  en: string;
}

export const PUBLIC_STATUS: Record<PublicTransportOrder["status"], BiText & { tone: "amber" | "green" | "red" | "blue" }> = {
  AWAITING_CONFIRMATION: { cs: "Čeká na potvrzení", en: "Awaiting your confirmation", tone: "amber" },
  CONFIRMED: { cs: "Potvrzeno", en: "Confirmed", tone: "green" },
  REJECTED: { cs: "Odmítnuto", en: "Rejected", tone: "red" },
  DELIVERED: { cs: "Doručeno", en: "Delivered", tone: "blue" },
};

export const LINK_INVALID: BiText = { cs: "Tento odkaz již neplatí.", en: "This link is no longer valid." };

/** Confirm / reject is asked once, while the order waits for it. */
export const canRespond = (o: Pick<PublicTransportOrder, "status">) => o.status === "AWAITING_CONFIRMATION";

/** The POD rule as the link page states it (owner decision 13). */
export const LINK_POD_RULE: BiText = {
  cs: "POD lze nahrát až po potvrzení objednávky, a to jednou. Opravu provede dispečer.",
  en: "The POD can be uploaded once the order is confirmed, and only once. The dispatcher replaces it if needed.",
};

/** The POD is uploaded once, after the order is confirmed. */
export const canUploadPod = (o: Pick<PublicTransportOrder, "status" | "podUploaded">) => !o.podUploaded && (o.status === "CONFIRMED" || o.status === "DELIVERED");

/** Why the answer cannot be sent yet, or null. A rejection needs its reason. */
export function respondProblem(action: "CONFIRM" | "REJECT", name: string, reason: string): BiText | null {
  if (name.trim().length < 2) return { cs: "Vyplňte své jméno.", en: "Enter your name." };
  if (action === "REJECT" && reason.trim().length < 3) return { cs: "Uveďte důvod odmítnutí.", en: "Give the reason for rejecting." };
  return null;
}

/** Why the POD cannot be sent yet, or null (the file itself is checked apart). */
export function podProblem(hasFile: boolean, receiverName: string, deliveredAt: string | null, now: Date = new Date()): BiText | null {
  if (!hasFile) return { cs: "Vyberte fotku nebo PDF dokladu.", en: "Choose a photo or PDF of the document." };
  if (receiverName.trim().length < 2) return { cs: "Vyplňte jméno příjemce.", en: "Enter the receiver's name." };
  if (deliveredAt && Date.parse(deliveredAt) > now.getTime() + 5 * 60_000) return { cs: "Čas doručení nemůže být v budoucnosti.", en: "The delivery time cannot be in the future." };
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A moment as a datetime-local field shows it ("2026-10-15T14:05"), in the phone's own time. */
export const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** What a datetime-local field holds, as an ISO time; null when empty or not a time. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
