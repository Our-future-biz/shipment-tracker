import type { Metadata } from "next";
import { CoLoadingOverview } from "./_components/CoLoadingOverview";

export const metadata: Metadata = { title: "Co-Loading Concept" };

// Co-Loading Concept's own page: what its name in the sidebar opens, the company's services to pick from.
export default function CoLoadingOverviewPage() {
  return <CoLoadingOverview />;
}
