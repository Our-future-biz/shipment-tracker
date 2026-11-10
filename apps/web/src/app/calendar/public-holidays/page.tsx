import { PAGE_TITLE } from "@/styles/ui";
import { PublicHolidaysView } from "./PublicHolidaysView";
import { SectionBackLink } from "@/components/SectionBackLink";

export default function PublicHolidaysPage() {
  return (
    /* stejne rozvrzeni jako stranka Exchange */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-5 min-w-0">
        {/* Back to the Calendar, above the title. */}
        <div className="min-w-0">
          <SectionBackLink className="mb-1" />
          <h1 className={PAGE_TITLE}>Public Holidays</h1>
        </div>
        <PublicHolidaysView />
      </div>
    </div>
  );
}
