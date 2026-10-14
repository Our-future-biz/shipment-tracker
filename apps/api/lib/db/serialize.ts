// Rows → API items. Encore sends dates as ISO strings, so API interfaces type them as string;
// services map rows explicitly (no `as unknown as`) so only the declared fields go out.

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
