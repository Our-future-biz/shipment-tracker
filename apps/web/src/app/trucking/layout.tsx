import type { ReactNode } from "react";
import { ModuleGate } from "@/components/ModuleGate";

// A company with the Trucking Concept hidden is sent to the dashboard (ModuleGate).
export default function TruckingLayout({ children }: { children: ReactNode }) {
  return <ModuleGate module="trucking_concept">{children}</ModuleGate>;
}
