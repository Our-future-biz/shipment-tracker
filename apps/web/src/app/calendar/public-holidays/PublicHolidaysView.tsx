"use client";

import { useEffect, useState } from "react";
import { RecordTabs } from "@/components/RecordTabs";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { HolidaysUploadTab } from "./_components/HolidaysUploadTab";
import { WorldHolidaysTab } from "./_components/WorldHolidaysTab";

const TABS = [
  { key: "upload", label: "Upload" },
  { key: "world", label: "World Holidays" },
] as const;

export function PublicHolidaysView() {
  const { holidays, isLoading } = usePublicHolidays();
  const [tab, setTab] = useState<string | null>(null);

  // Opens on World Holidays once there is something to show, otherwise on Upload.
  useEffect(() => {
    if (tab === null && !isLoading) setTab(holidays.length ? "world" : "upload");
  }, [tab, isLoading, holidays.length]);

  const active = tab ?? "world";
  // Both tabs stay mounted, so files read on Upload are still there after a look at the list.
  return (
    <div>
      <RecordTabs tabs={TABS} active={active} onChange={setTab} label="Public holiday sections" className="border-b border-slate-200 mb-4" />
      <div hidden={active !== "upload"}>
        <HolidaysUploadTab onSaved={() => setTab("world")} />
      </div>
      <div hidden={active !== "world"}>
        <WorldHolidaysTab items={holidays} loading={isLoading} />
      </div>
    </div>
  );
}
