import { Suspense } from "react";
import type { Metadata } from "next";
import { QuoteWorkflow } from "./QuoteWorkflow";

type Props = { params: Promise<{ ref: string }> };

// The browser tab carries the reference, so quotes open side by side can be told apart.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ref } = await params;
  return { title: ref };
}

// Keyed by ref so switching between sibling quotes (QCZ…-2, -3) remounts the
// workflow instead of carrying the previous quote's draft state over.
export default async function QuoteWorkflowPage({ params }: Props) {
  const { ref } = await params;
  return (
    <Suspense fallback={null}>
      <QuoteWorkflow key={ref} />
    </Suspense>
  );
}
