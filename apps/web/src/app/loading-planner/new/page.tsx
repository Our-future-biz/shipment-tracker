import type { Metadata } from "next";
import { PlannerPage } from "../_components/PlannerPage";

export const metadata: Metadata = { title: "New loading plan" };

export default function NewLoadingPlanRoute() {
  return <PlannerPage />;
}
