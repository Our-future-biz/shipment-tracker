"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Spin } from "antd";
import { RecordTabs } from "@/components/RecordTabs";
import { LINK_CLASS } from "@/components/linkClass";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { CompanyDetailsCard } from "../_components/CompanyDetailsCard";
import { SalesPage } from "../_components/SalesPage";
import { TermsTab } from "../_components/TermsTab";
import { SALES_PAGES, SALES_SETTINGS_TABS } from "../_lib/tabs";

const DEFAULT_TAB = SALES_SETTINGS_TABS[0].key;

// What all of Sales shares: who quotes are from, and the Terms & Conditions templates. Only those
// the server lets manage Sales (managers, admins) see the page; anybody else is told it is not
// theirs. Quotes still read both through their own requests - no quotation prints without them.
export function SalesSettingsContent() {
  const permissions = useSalesPermissions();
  if (permissions.status !== "ready" || !permissions.canManageSales) {
    return (
      <SalesPage title="Sales Settings">
        {permissions.status === "loading" ? (
          <Spin />
        ) : permissions.status === "error" ? (
          <Alert
            type="error"
            showIcon
            message="Could not check whether you may open Sales Settings."
            action={
              <Button size="small" onClick={() => permissions.reload()}>
                Retry
              </Button>
            }
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Sales Settings is for managers and admins."
            description={
              <>
                Ask a manager to change the company details or the Terms &amp; Conditions templates.{" "}
                <Link href={SALES_PAGES.quotes.path} className={LINK_CLASS}>
                  Back to Quotes
                </Link>
              </>
            }
          />
        )}
      </SalesPage>
    );
  }
  return <SalesSettingsTabs />;
}

function SalesSettingsTabs() {
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
