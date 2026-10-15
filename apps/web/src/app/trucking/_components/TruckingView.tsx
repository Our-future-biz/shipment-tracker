"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Drawer } from "antd";
import { TRUCKING_TABS, type TruckingTab } from "../_lib/tabs";
import { TruckingEmptyTab } from "./TruckingEmptyTab";
import { TruckingReadme } from "./TruckingReadme";
import { TruckingTabs } from "./TruckingTabs";

const FIRST_TAB: TruckingTab = TRUCKING_TABS[0].key;

// The Trucking module: tabs in work order (?tab=, the first tab keeps the address clean) and the
// Read me in the "?" help drawer.
export const TruckingView = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = TRUCKING_TABS.find((t) => t.key === tabParam) ?? TRUCKING_TABS[0];
  const [helpOpen, setHelpOpen] = useState(false);

  const handleTabChange = (tab: TruckingTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === FIRST_TAB) params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trucking</h1>
          {/* No counts yet: nothing is recorded in Trucking until its phases land. */}
          <TruckingTabs active={activeTab.key} counts={{}} onChange={handleTabChange} onHelp={() => setHelpOpen(true)} />
        </div>
        <TruckingEmptyTab tab={activeTab} />
      </div>
      <Drawer title="Read me" width={760} open={helpOpen} onClose={() => setHelpOpen(false)}>
        <TruckingReadme />
      </Drawer>
    </div>
  );
};
