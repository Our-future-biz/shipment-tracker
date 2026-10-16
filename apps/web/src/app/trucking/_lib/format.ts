import { createElement } from "react";
import { businessDayOf, formatDate } from "@/lib/date";
import { formatPsc } from "./hauliers";

// Small display helpers every Trucking list and card uses: sorting by text or number, a postcode
// with its city, and the grey dash of an empty cell. Tested in format.test.ts.

/** Sorts text the Czech way (Č after C, Ř after R). */
export const byText = (a: string, b: string) => a.localeCompare(b, "cs");

/** Sorts numbers; a missing one first. */
export const byNumber = (a: number | null, b: number | null) => (a ?? -Infinity) - (b ?? -Infinity);

/** "110 00 Praha": a five-digit postcode spaced, then the city; "" when neither is known. */
export const place = (psc: string, city: string) => [psc ? formatPsc(psc) : "", city].filter(Boolean).join(" ");

/** The grey dash of an empty cell. */
export const dash = createElement("span", { className: "text-slate-400" }, "—");

/** "16.10.2026": the day of a stored time on the company's calendar (Prague), whatever the viewer's clock; "" for none. */
export const pragueDate = (at: string | null | undefined) => formatDate(businessDayOf(at));
