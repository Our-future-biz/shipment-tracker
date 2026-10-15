import type { Metadata } from "next";
import { SalesPage } from "../_components/SalesPage";
import { SalesReportTab } from "../_components/SalesReportTab";
import { SALES_PAGES } from "../_lib/tabs";

export const metadata: Metadata = { title: SALES_PAGES.report.label };

export default function SalesReportPage() {
  return (
    <SalesPage title={SALES_PAGES.report.label}>
      <SalesReportTab />
    </SalesPage>
  );
}
