// "also supplier" / "also customer" beside the name of a company that is both.
export function AlsoChip({ children }: { children: string }) {
  return <span className="whitespace-nowrap rounded-xl bg-slate-100 px-2 py-0.5 text-[11px] font-medium leading-[18px] text-slate-500">{children}</span>;
}
