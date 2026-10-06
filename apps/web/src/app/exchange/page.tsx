import { ExchangeView } from "./ExchangeView";

export default function ExchangePage() {
  return (
    /* stejne rozvrzeni jako stranka Customs */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Exchange rates</h1>
        <ExchangeView />
      </div>
    </div>
  );
}
