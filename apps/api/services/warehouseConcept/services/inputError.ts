import log from "encore.dev/log";

/** A message written for the user: why their input is not accepted. Safe to show as it is. */
export class InputError extends Error {}

/** The user's message of an InputError; anything else is logged and answered with `fallback`. */
export function inputMessage(err: unknown, fallback: string): string {
  if (err instanceof InputError) return err.message;
  log.warn(err, "warehouse: input could not be read", { fallback });
  return fallback;
}
