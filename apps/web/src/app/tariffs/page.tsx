import { redirect } from "next/navigation";
import { TARIFF_PAGES } from "./_lib/tariffPages";

// "Tariffs" in the sidebar opens its first section: the module has no overview page yet.
export default function TariffsRedirectPage() {
  redirect(TARIFF_PAGES.railOperators.path);
}
