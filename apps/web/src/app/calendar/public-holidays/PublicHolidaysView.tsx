"use client";

import { useEffect, useState } from "react";
import { Tabs } from "antd";
import { usePublicHolidays } from "@/hooks/usePublicHolidays";
import { HolidaysUploadTab } from "./_components/HolidaysUploadTab";
import { WorldHolidaysTab } from "./_components/WorldHolidaysTab";

export function PublicHolidaysView() {
  const { holidays, isLoading } = usePublicHolidays();
  const [tab, setTab] = useState<string | null>(null);

  // Opens on World Holidays once there is something to show, otherwise on Upload.
  useEffect(() => {
    if (tab === null && !isLoading) setTab(holidays.length ? "world" : "upload");
  }, [tab, isLoading, holidays.length]);

  return (
    <Tabs
      activeKey={tab ?? "world"}
      onChange={setTab}
      items={[
        { key: "upload", label: "Upload", children: <HolidaysUploadTab onSaved={() => setTab("world")} /> },
        { key: "world", label: "World Holidays", children: <WorldHolidaysTab items={holidays} loading={isLoading} /> },
      ]}
    />
  );
}
