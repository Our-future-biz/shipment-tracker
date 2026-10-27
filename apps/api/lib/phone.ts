import { APIError } from "encore.dev/api";

// A Czech phone number (+420 or 00420) has exactly 9 digits after the country code.
// Numbers without a country code or with another one are not checked here.
// The web forms apply the same rule (web/src/lib/phone.ts).

export const CZECH_PHONE_MESSAGE = "A Czech phone number (+420) must have exactly 9 digits";

const CZECH_PREFIX = /^(?:\+|00)420/;

/** The message when `value` is a +420 number without exactly 9 digits after the code; "" otherwise. */
export function czechPhoneProblem(value: string | null | undefined): string {
  const compact = (value ?? "").replace(/[\s\-./()]/g, "");
  if (!CZECH_PREFIX.test(compact)) return "";
  return /^\d{9}$/.test(compact.replace(CZECH_PREFIX, "")) ? "" : CZECH_PHONE_MESSAGE;
}

/** Refuses a +420 number without exactly 9 digits; `label` names the field in the message. */
export function assertCzechPhone(value: string | null | undefined, label = "Phone"): void {
  const problem = czechPhoneProblem(value);
  if (problem) throw APIError.invalidArgument(`${label}: ${problem}`);
}
