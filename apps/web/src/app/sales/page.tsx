import { redirect } from "next/navigation";
import { SALES_PAGES } from "./_lib/tabs";

// "Sales" in the sidebar opens the Quotes list: that is where the work starts.
export default function SalesRedirectPage() {
  redirect(SALES_PAGES.quotes.path);
}
