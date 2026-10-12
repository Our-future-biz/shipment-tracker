import { CalendarView } from "./CalendarView";

export default function CalendarPage() {
  return (
    /* stejne rozvrzeni jako stranka Exchange */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <CalendarView />
      </div>
    </div>
  );
}
