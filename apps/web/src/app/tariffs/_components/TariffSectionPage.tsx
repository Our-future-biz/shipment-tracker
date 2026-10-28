// The frame of a Tariffs section: its title over an empty card, until the section gets its content.
export function TariffSectionPage({ title }: { title: string }) {
  return (
    /* same layout as the Exchange page */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-16 text-center text-slate-400 text-sm">
          No tariffs yet.
        </div>
      </div>
    </div>
  );
}
