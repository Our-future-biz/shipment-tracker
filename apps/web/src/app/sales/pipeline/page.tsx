import type { Metadata } from "next";
import { PipelineTab } from "../_components/PipelineTab";
import { SALES_PAGES } from "../_lib/tabs";

export const metadata: Metadata = { title: SALES_PAGES.pipeline.label };

// The board draws the page frame itself: the period it keeps is chosen in the title row.
export default function SalesPipelinePage() {
  return <PipelineTab />;
}
