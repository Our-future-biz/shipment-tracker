import { CustomsView } from "./CustomsView";

export default function CustomsPage() {
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6 w-full min-w-0 overflow-x-hidden">
      <div className="max-w-[1600px] mx-auto w-full min-w-0">
        {/* h1.pg from the mockup: 24px bold, same as the Shipments heading */}
        <h1 className="text-2xl font-bold text-slate-900 mb-5">Customs</h1>
        <CustomsView />
      </div>
    </div>
  );
}
