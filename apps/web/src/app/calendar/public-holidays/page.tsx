import { PublicHolidaysView } from "./PublicHolidaysView";

export default function PublicHolidaysPage() {
  return (
    /* stejne rozvrzeni jako stranka Exchange */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Public Holidays</h1>
        <PublicHolidaysView />
      </div>
    </div>
  );
}
