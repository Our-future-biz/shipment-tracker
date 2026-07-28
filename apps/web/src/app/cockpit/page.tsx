import { PageHeader } from "@/components/PageHeader";

export default function CockpitPage() {
  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Cockpit" />
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="text-sm font-semibold text-slate-700">Cockpit</div>
          <div className="text-xs text-slate-400 mt-1">Coming soon.</div>
        </div>
      </div>
    </div>
  );
}
