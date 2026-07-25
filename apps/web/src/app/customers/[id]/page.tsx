import { Suspense } from "react";
import { CustomerDetailContent } from "./CustomerDetailContent";

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={null}>
      <CustomerDetailContent />
    </Suspense>
  );
}
