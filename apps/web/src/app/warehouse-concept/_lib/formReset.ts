// When a record form fills itself from its initial values: only as it opens. While it is open its
// caller renders again (a save in flight, a background poll) and hands it new initial objects;
// those must not wipe what was typed, nor the server's refusal shown in the form. Pure (tested in
// formReset.test.ts).

/** True only on the render the form goes from closed (or not yet shown) to open. */
export const formOpensNow = (wasOpen: boolean, open: boolean): boolean => open && !wasOpen;
