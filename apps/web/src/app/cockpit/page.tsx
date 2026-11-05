import { PageHeader } from "@/components/PageHeader";
import { CARD, HINT } from "@/styles/ui";

export default function CockpitPage() {
  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Cockpit" />
        <div className={`${CARD} p-12 text-center`}>
          <div className="text-[14px] font-semibold text-slate-700">Cockpit</div>
          <div className={`${HINT} mt-1`}>Coming soon.</div>
        </div>
      </div>
    </div>
  );
}
