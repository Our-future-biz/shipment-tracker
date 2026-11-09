import type { Metadata } from "next";
import { SectionOverview } from "@/components/SectionOverview";

export const metadata: Metadata = { title: "Sales" };

// Sales' own page: what "Sales" in the sidebar opens, its pages to pick from.
export default function SalesOverviewPage() {
  return <SectionOverview path="/sales" />;
}
