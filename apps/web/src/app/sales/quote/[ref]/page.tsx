import { Suspense } from "react";
import { QuoteWorkflow } from "./QuoteWorkflow";

// Keyed by ref so switching between sibling quotes (QCZ…-2, -3) remounts the
// workflow instead of carrying the previous quote's draft state over.
export default async function QuoteWorkflowPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return (
    <Suspense fallback={null}>
      <QuoteWorkflow key={ref} />
    </Suspense>
  );
}
