"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "antd";
import { api } from "@/lib/api";
import { UploadTab } from "./_components/UploadTab";
import { WorldHolidaysTab } from "./_components/WorldHolidaysTab";

export default function PublicHolidaysPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-holidays"],
    queryFn: () => api.holidays.holidayList(),
  });
  const items = data?.holidays ?? [];
  const [tab, setTab] = useState<string | null>(null);

  // Opens on World Holidays once there is something to show, otherwise on Upload.
  useEffect(() => {
    if (tab === null && !isLoading) setTab(items.length ? "world" : "upload");
  }, [tab, isLoading, items.length]);

  return (
    /* stejne rozvrzeni jako stranka Exchange */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Public Holidays</h1>
        <Tabs
          activeKey={tab ?? "world"}
          onChange={setTab}
          items={[
            { key: "upload", label: "Upload", children: <UploadTab onSaved={() => setTab("world")} /> },
            { key: "world", label: "World Holidays", children: <WorldHolidaysTab items={items} loading={isLoading} /> },
          ]}
        />
      </div>
    </div>
  );
}
