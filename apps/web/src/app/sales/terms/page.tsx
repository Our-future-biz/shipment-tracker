import { redirect } from "next/navigation";
import { salesSettingsHref } from "../_lib/tabs";

// The Terms & Conditions page became a tab of Sales Settings. This keeps its old links and
// bookmarks working.
export default function SalesTermsRedirectPage() {
  redirect(salesSettingsHref("terms"));
}
