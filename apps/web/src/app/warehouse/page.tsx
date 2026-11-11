import type { Metadata } from "next";
import { SectionOverview } from "@/components/SectionOverview";

export const metadata: Metadata = { title: "Warehouse" };

// Warehouse's own page: what "Warehouse" in the sidebar opens, its three lists to pick from (as Sales).
export default function WarehouseOverviewPage() {
  return <SectionOverview path="/warehouse" />;
}
