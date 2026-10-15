import type { Metadata } from "next";
import { SalesPage } from "../_components/SalesPage";
import { FollowUpTab } from "../_components/FollowUpTab";
import { SALES_PAGES } from "../_lib/tabs";

export const metadata: Metadata = { title: SALES_PAGES.followup.label };

export default function SalesFollowUpPage() {
  return (
    <SalesPage title={SALES_PAGES.followup.label} subtitle="Quotes that are with a customer and the team's manual follow-up tasks">
      <FollowUpTab />
    </SalesPage>
  );
}
