// The look shared by the haulier portal's phone screens: big fields and buttons a thumb hits.

export const PORTAL_INPUT = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 focus:border-indigo-500 focus:outline-none";
export const PORTAL_LABEL = "mb-1 block text-[13px] font-semibold text-slate-600";
export const PORTAL_PRIMARY = "w-full rounded-lg bg-indigo-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50";
export const PORTAL_SECONDARY = "w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-[15px] font-semibold text-slate-700 disabled:opacity-50";
export const PORTAL_CARD = "rounded-xl border border-slate-200 bg-white p-4";
export const PORTAL_CARD_TITLE = "m-0 mb-2 text-[13px] font-bold uppercase tracking-wide text-indigo-700";

export const PORTAL_TONE = {
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  slate: "bg-slate-100 text-slate-700",
} as const;
