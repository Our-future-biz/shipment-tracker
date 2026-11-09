import type { Metadata } from "next";
import { SectionOverview } from "@/components/SectionOverview";

export const metadata: Metadata = { title: "Finance" };

// Finance's own page: what "Finance" in the sidebar opens, Invoicing and Exchange to pick from.
export default function FinanceOverviewPage() {
  return <SectionOverview path="/finance" />;
}
