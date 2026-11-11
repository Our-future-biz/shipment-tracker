// The id a desk write is sent with (`clientRequestId`, as floor mode sends): the same while what is
// sent stays the same, so a second send (a double press, a retry after a lost answer) adds nothing
// on the server; a new one once it changes, since a corrected value is a new write. Pure (tested in
// writeId.test.ts).

export type WriteId = { key: string; id: string };

/** `prev` again when `key` (what is sent) is unchanged, else a new id from `make`. */
export const writeIdFor = (prev: WriteId | null, key: string, make: () => string): WriteId => (prev && prev.key === key ? prev : { key, id: make() });
