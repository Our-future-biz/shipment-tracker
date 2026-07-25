import { Suspense } from "react";
import { SalesView } from "./_components/SalesView";

export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesView />
    </Suspense>
  );
}
