import { BTN, BTN_PRIMARY, ICON_BTN_GHOST } from "@/styles/ui";

// The app's buttons (styles/ui.ts) drawn on a link (<Link>, <a>). antd gives every <a> under its App
// its own link colour in unlayered CSS, which beats the text colour of BTN / BTN_PRIMARY /
// ICON_BTN_GHOST (Tailwind's layer), so a link that looks like a button takes its colour back with "!".

/** A link drawn as a button (BTN). */
export const LINK_BTN = `${BTN} !text-slate-700 hover:!text-slate-900`;
/** A link drawn as the main action (BTN_PRIMARY): white on indigo, never indigo on indigo. */
export const LINK_BTN_PRIMARY = `${BTN_PRIMARY} !text-white hover:!text-white`;
/** An icon-only link with no frame (ICON_BTN_GHOST): the back arrow of a page, the settings cog. */
export const LINK_ICON_BTN_GHOST = `${ICON_BTN_GHOST} !text-slate-500 hover:!text-slate-900`;
