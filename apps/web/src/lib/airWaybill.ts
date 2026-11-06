/**
 * Whether an air waybill number is whole: an airline's 3 digits and 8 more, the last of which is the
 * first 7 of them modulo 7. A typing mistake usually breaks it. An empty value doesn't count as
 * wrong (not filled in yet), nor does a house number, which is the forwarder's own and has no rule.
 */
export function airWaybillOk(raw?: string | null): boolean {
  const digits = (raw ?? "").replace(/[\s-]/g, "");
  if (!digits) return true;
  if (!/^\d{11}$/.test(digits)) return false;
  return Number(digits.slice(3, 10)) % 7 === Number(digits[10]);
}
