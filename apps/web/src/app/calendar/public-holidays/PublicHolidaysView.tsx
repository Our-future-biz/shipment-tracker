"use client";

import { useEffect, useState } from "react";
import { RecordTabs } from "@/components/RecordTabs";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { useCanManageHolidays } from "@/lib/auth/AuthContext";
import { HolidaysUploadTab } from "./_components/HolidaysUploadTab";
import { WorldHolidaysTab } from "./_components/WorldHolidaysTab";

const TABS = [
  { key: "upload", label: "Upload" },
  { key: "world", label: "World Holidays" },
] as const;

export function PublicHolidaysView() {
  const { holidays, isLoading } = usePublicHolidays();
  // Uploading is a manager's (the server refuses anyone else); everyone sees the list.
  const canManage = useCanManageHolidays();
  const [tab, setTab] = useState<string | null>(null);

  // Opens on World Holidays once there is something to show, otherwise on Upload.
  useEffect(() => {
    if (tab === null && !isLoading) setTab(holidays.length || !canManage ? "world" : "upload");
  }, [tab, isLoading, holidays.length, canManage]);

  const active = canManage ? (tab ?? "world") : "world";
  // Both tabs stay mounted, so files read on Upload are still there after a look at the list.
  return (
    <div>
      <RecordTabs tabs={canManage ? TABS : TABS.filter((t) => t.key !== "upload")} active={active} onChange={setTab} label="Public holiday sections" className="border-b border-slate-200 mb-4" />
      {canManage && (
        <div hidden={active !== "upload"}>
          <HolidaysUploadTab onSaved={() => setTab("world")} />
        </div>
      )}
      <div hidden={active !== "world"}>
        <WorldHolidaysTab items={holidays} loading={isLoading} />
      </div>
    </div>
  );
}
