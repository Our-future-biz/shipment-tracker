import type { Metadata } from "next";
import { SalesPage } from "../_components/SalesPage";
import { ShipmentReportsTab } from "../_components/ShipmentReportsTab";
import { SALES_PAGES } from "../_lib/tabs";

export const metadata: Metadata = { title: SALES_PAGES.jobProfit.label };

// Job profit in CZK at each month's ČNB average (not a copy of the Shipments list any more).
export default function SalesJobProfitPage() {
  return (
    <SalesPage title={SALES_PAGES.jobProfit.label}>
      <ShipmentReportsTab />
    </SalesPage>
  );
}
