import { Suspense } from "react";
import type { Metadata } from "next";
import { SalesManagersContent } from "./_components/SalesManagersContent";

export const metadata: Metadata = { title: "Managers" };

export default function SalesManagersPage() {
  return (
    // The page reads its freight mode from the URL.
    <Suspense fallback={null}>
      <SalesManagersContent />
    </Suspense>
  );
}
