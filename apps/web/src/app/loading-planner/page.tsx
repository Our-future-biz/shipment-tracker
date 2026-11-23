import type { Metadata } from "next";
import { LoadingPlannerOverview } from "./_components/LoadingPlannerOverview";

export const metadata: Metadata = { title: "Loading Planner" };

// The Loading Planner's own page: the saved plans, and the way to a new one.
export default function LoadingPlannerPage() {
  return <LoadingPlannerOverview />;
}
