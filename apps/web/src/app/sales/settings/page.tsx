import { Suspense } from "react";
import type { Metadata } from "next";
import { SalesSettingsContent } from "./SalesSettingsContent";

export const metadata: Metadata = { title: "Sales Settings" };

export default function SalesSettingsPage() {
  return (
    // The page reads its tab from the URL.
    <Suspense fallback={null}>
      <SalesSettingsContent />
    </Suspense>
  );
}
