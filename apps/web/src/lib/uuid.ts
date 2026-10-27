const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whether a text has the form of a record's id. An address is typed by hand or bookmarked: what
// it holds in place of an id is checked before the server is asked, which would answer anything
// else with an error of its own.
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** A new v4 UUID. crypto.randomUUID exists only on https / localhost; getRandomValues works everywhere. */
export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
