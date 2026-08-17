// Field rules applied on every shipment write, so they hold no matter which
// entry point performed it (detail page, list, create wizard, quote copy,
// document extraction).

export const EXPORT_DEFAULT_BOL_TYPE = "OBL";
export const DEFAULT_CREDIT_CHECK = "Red";
export const APPROVED_CREDIT_CHECK = "Green";
export const DEFAULT_VGM = "Pending (Red)";
export const DEFAULT_BOOKING_CONFIRMATION = "Pending";
export const DEFAULT_INVOICING_STATUS = "Not Invoiced";

const isBlank = (v: string | null | undefined): boolean => !(v ?? "").trim();
const eq = (v: string | null | undefined, expected: string): boolean =>
  (v ?? "").trim().toLowerCase() === expected.toLowerCase();

// Export shipments start with an OBL on both bills of lading. Only a blank field
// is filled, so a type someone picked is never overwritten — the default is a
// starting point, not an enforced value.
export function exportBolDefaults(
  tradeDirection: string | null | undefined,
  current: { houseBolType?: string | null; masterBolType?: string | null },
): { houseBolType?: string; masterBolType?: string } {
  if (!eq(tradeDirection, "Export")) return {};
  const defaults: { houseBolType?: string; masterBolType?: string } = {};
  if (isBlank(current.houseBolType)) defaults.houseBolType = EXPORT_DEFAULT_BOL_TYPE;
  if (isBlank(current.masterBolType)) defaults.masterBolType = EXPORT_DEFAULT_BOL_TYPE;
  return defaults;
}

// The states a shipment starts in: nothing is approved or confirmed yet. Only
// blank fields are seeded, so these never overwrite a state someone set.
export interface StartingStates {
  creditCheck?: string;
  vgm?: string;
  bookingConfirmation?: string;
  invoicingStatus?: string;
}

export function startingStateDefaults(current: {
  creditCheck?: string | null;
  vgm?: string | null;
  bookingConfirmation?: string | null;
  invoicingStatus?: string | null;
}): StartingStates {
  const defaults: StartingStates = {};
  if (isBlank(current.creditCheck)) defaults.creditCheck = DEFAULT_CREDIT_CHECK;
  if (isBlank(current.vgm)) defaults.vgm = DEFAULT_VGM;
  if (isBlank(current.bookingConfirmation)) defaults.bookingConfirmation = DEFAULT_BOOKING_CONFIRMATION;
  if (isBlank(current.invoicingStatus)) defaults.invoicingStatus = DEFAULT_INVOICING_STATUS;
  return defaults;
}

// True when a write moves the credit check to approved — the moment the
// approval is stamped. Staying on Green does not re-stamp.
export function isCreditApproval(next: string | null | undefined, previous: string | null | undefined): boolean {
  return eq(next, APPROVED_CREDIT_CHECK) && !eq(previous, APPROVED_CREDIT_CHECK);
}

// Record of a manual action on a shipment — who did it and when. Used for the
// credit-check approval and the house BoL release. Falls back to the timestamp
// alone if the acting user cannot be named.
export function actionStamp(actor: string, at: Date): string {
  const when = at.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
  return actor.trim() ? `${actor.trim()} — ${when}` : when;
}
