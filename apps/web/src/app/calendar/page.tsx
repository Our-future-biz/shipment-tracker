import { PAGE_TITLE } from "@/styles/ui";
import { CalendarView } from "./CalendarView";

export default function CalendarPage() {
  return (
    /* stejne rozvrzeni jako stranka Exchange */
    <div className="bg-slate-50 min-h-full px-8 py-6 print:bg-white print:p-0">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className={`${PAGE_TITLE} print:hidden`}>Calendar</h1>
        <CalendarView />
      </div>
    </div>
  );
}
