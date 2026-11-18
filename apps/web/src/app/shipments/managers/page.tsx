import { Suspense } from "react";
import type { Metadata } from "next";
import { ShipmentsManagersContent } from "./_components/ShipmentsManagersContent";

export const metadata: Metadata = { title: "Managers" };

export default function ShipmentsManagersPage() {
  return (
    // The page reads its tab and its filters from the URL.
    <Suspense fallback={null}>
      <ShipmentsManagersContent />
    </Suspense>
  );
}
