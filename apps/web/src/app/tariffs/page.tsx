import { redirect } from "next/navigation";

// "Tariffs" in the sidebar opens its first section: the module has no overview page yet.
export default function TariffsRedirectPage() {
  redirect("/tariffs/rail-operators");
}
