import type { ReactNode } from "react";
import { SuperadminOnly } from "@/components/SuperadminOnly";

// Trucking Concept is shown to superadmins only (SuperadminOnly).
export default function TruckingLayout({ children }: { children: ReactNode }) {
  return <SuperadminOnly>{children}</SuperadminOnly>;
}
