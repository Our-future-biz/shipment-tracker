// The To, CC and BCC fields of the Email dialog each take one address or several, separated by
// commas or semicolons - as mail programs read them in a mailto: link.

export type AddressField = "to" | "cc" | "bcc";

const ADDRESS = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** The addresses a field holds, in order. */
export function splitAddresses(value: string | undefined | null): string[] {
  return (value ?? "")
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** The first of a field's addresses that is none; null when they all are (or the field is empty). */
export function invalidAddress(value: string | undefined | null): string | null {
  return splitAddresses(value).find((a) => !ADDRESS.test(a)) ?? null;
}

/** A field with this address added after the ones it holds - unless it holds it already, whatever its case. */
export function withAddress(value: string | undefined | null, address: string): string {
  const list = splitAddresses(value);
  if (list.some((a) => a.toLowerCase() === address.toLowerCase())) return list.join(", ");
  return [...list, address].join(", ");
}

/** Every address of the three fields, each once: what is remembered as used once the message is handed over. */
export function usedAddresses(fields: Partial<Record<AddressField, string>>): string[] {
  const all = [...splitAddresses(fields.to), ...splitAddresses(fields.cc), ...splitAddresses(fields.bcc)].filter((a) => ADDRESS.test(a));
  return all.filter((a, i) => all.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i);
}
