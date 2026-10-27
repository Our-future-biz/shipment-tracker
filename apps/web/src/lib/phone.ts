// A Czech phone number (+420 or 00420) has exactly 9 digits after the country code.
// Numbers without a country code or with another one are not checked here.
// The API applies the same rule (api/lib/phone.ts).

export const CZECH_PHONE_MESSAGE = "A Czech phone number (+420) must have exactly 9 digits";

const CZECH_PREFIX = /^(?:\+|00)420/;

/** The message when `value` is a +420 number without exactly 9 digits after the code; "" otherwise. */
export function czechPhoneProblem(value: string | null | undefined): string {
  const compact = (value ?? "").replace(/[\s\-./()]/g, "");
  if (!CZECH_PREFIX.test(compact)) return "";
  return /^\d{9}$/.test(compact.replace(CZECH_PREFIX, "")) ? "" : CZECH_PHONE_MESSAGE;
}

/** `digits` with at most 9 digits: the rest of the digits is dropped (other characters are kept). */
export function limitCzechDigits(digits: string): string {
  let count = 0;
  return [...digits].filter((ch) => !/\d/.test(ch) || ++count <= 9).join("");
}

/**
 * A free-typed phone number cut so a +420 / 00420 number has at most 9 digits after the code:
 * typing a 10th digit does nothing. Other numbers are returned as typed.
 */
export function limitCzechPhone(value: string): string {
  const prefix = /^\s*(?:\+|00)\s*4\s*2\s*0/.exec(value);
  if (!prefix) return value;
  return prefix[0] + limitCzechDigits(value.slice(prefix[0].length));
}

/** An antd Form rule with the Czech phone check. */
export const czechPhoneRule = {
  validator: (_: unknown, value?: string) => {
    const problem = czechPhoneProblem(value);
    return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
  },
};
