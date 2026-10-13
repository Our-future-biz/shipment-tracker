import { formatDate } from "@/lib/date";

// Table cells shared by the holiday tables: blanks show as a dash, dates as dd.mm.yyyy.
export const dash = <span className="text-slate-300">—</span>;
export const textCell = (v: string) => v || dash;
export const dateCell = (v: string) => (v ? <span className="tabular-nums">{formatDate(v)}</span> : dash);
