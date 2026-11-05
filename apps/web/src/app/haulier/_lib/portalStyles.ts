import type { Tone } from "@/components/Badge";
import { BTN, BTN_DANGER, BTN_PRIMARY, LABEL_TEXT } from "@/styles/ui";

// The look of the haulier portal's phone screens: the app's own (styles/ui.ts), only taller where a
// thumb has to hit it, and 16px in a field so a phone does not zoom in on it.

/** A field (input or textarea): the app's INPUT frame and focus ring, at a thumb's size. */
export const PORTAL_INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors";
export const PORTAL_LABEL = `mb-1 block ${LABEL_TEXT}`;
/** The app's buttons, full width and 44px tall. */
export const PORTAL_PRIMARY = `${BTN_PRIMARY} w-full !h-11 !text-[14px]`;
export const PORTAL_SECONDARY = `${BTN} w-full !h-11 !text-[14px]`;
export const PORTAL_DANGER = `${BTN_DANGER} w-full !h-11 !text-[14px]`;
/** PORTAL_PRIMARY on a link: antd colours every <a> in unlayered CSS, which would beat the white. */
export const PORTAL_PRIMARY_LINK = `${PORTAL_PRIMARY} !text-white hover:!text-white no-underline`;

/** The Badge tone of a portal status (lib/portal, lib/publicOrder). */
export const PORTAL_BADGE_TONE: Record<"amber" | "green" | "red" | "blue" | "slate", Tone> = {
  amber: "a",
  green: "g",
  red: "r",
  blue: "b",
  slate: "",
};
