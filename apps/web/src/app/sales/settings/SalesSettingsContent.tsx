"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RecordTabs } from "@/components/RecordTabs";
import { CompanyDetailsCard } from "../_components/CompanyDetailsCard";
import { SalesPage } from "../_components/SalesPage";
import { TermsTab } from "../_components/TermsTab";
import { SALES_SETTINGS_TABS } from "../_lib/tabs";

const DEFAULT_TAB = SALES_SETTINGS_TABS[0].key;

// What all of Sales shares: who quotes are from, and the Terms & Conditions templates. Everybody
// can open the page and read both; who may change them is the server's answer, which each tab
// asks for itself and says when it is "no".
export function SalesSettingsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The active tab lives in the URL (?tab=) so it survives a reload and can be linked to.
  const requested = searchParams.get("tab");
  const activeTab = SALES_SETTINGS_TABS.find((tab) => tab.key === requested)?.key ?? DEFAULT_TAB;

  const handleSelectTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <SalesPage title="Sales Settings">
      <RecordTabs
        label="Sales settings"
        tabs={SALES_SETTINGS_TABS}
        active={activeTab}
        onChange={handleSelectTab}
        className="border-b border-slate-200"
      />
      {/* Both tabs stay mounted and the other one is only hidden: company details that were typed
          and not saved yet, and a template change still on its way to the server, must not be
          lost by looking at the other tab. */}
      <div hidden={activeTab !== "company"}>
        <CompanyDetailsCard />
      </div>
      <div hidden={activeTab !== "terms"}>
        <TermsTab />
      </div>
    </SalesPage>
  );
}
