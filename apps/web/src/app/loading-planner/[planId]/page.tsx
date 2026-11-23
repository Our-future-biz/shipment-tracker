import { Suspense } from "react";
import type { Metadata } from "next";
import { PlannerPage } from "../_components/PlannerPage";

export const metadata: Metadata = { title: "Loading plan" };

// The planner reads the address (a new plan opened from a job names it there), hence the Suspense.
export default function LoadingPlanRoute() {
  return (
    <Suspense>
      <PlannerPage />
    </Suspense>
  );
}
