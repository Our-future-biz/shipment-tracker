import type { Metadata } from "next";
import { SectionOverview } from "@/components/SectionOverview";

export const metadata: Metadata = { title: "Tariffs" };

// Tariffs' own page: what "Tariffs" in the sidebar opens, its sections to pick from.
export default function TariffsOverviewPage() {
  return <SectionOverview path="/tariffs" />;
}
