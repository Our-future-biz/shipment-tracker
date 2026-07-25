import { Suspense } from "react";
import { QuoteWorkflow } from "./QuoteWorkflow";

export default function QuoteWorkflowPage() {
  return (
    <Suspense fallback={null}>
      <QuoteWorkflow />
    </Suspense>
  );
}
