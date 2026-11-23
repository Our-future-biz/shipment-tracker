import type { Metadata } from "next";
import { PlannerPage } from "../_components/PlannerPage";

export const metadata: Metadata = { title: "Loading plan" };

export default function LoadingPlanRoute() {
  return <PlannerPage />;
}
