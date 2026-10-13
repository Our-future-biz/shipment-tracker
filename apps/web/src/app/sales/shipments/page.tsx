import { redirect } from "next/navigation";

// "Shipment Reports" was a shorter copy of the Shipments list, which has the same columns. This
// keeps its old links and bookmarks working.
export default function SalesShipmentReportsRedirectPage() {
  redirect("/shipments");
}
