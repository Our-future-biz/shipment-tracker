"use client";

import type { CustomerItem } from "@/hooks/useCustomers";
import { useCollectionHaulier } from "@/hooks/useCollectionTariffs";
import { useShippingLine } from "@/hooks/useOceanTariffs";
import { useRailOperator } from "@/hooks/useRailTariffs";
import type { SupplierTariffSummary } from "../../_lib/supplierAttention";

// The tariffs Tariffs holds from a supplier, one summary per role it is kept under (rail operator, shipping
// line, first / last mile haulier). A role the company does not have is not asked for. A haulier's buy
// tariffs live in Trucking and are not here.
export function useSupplierTariffs(customer: CustomerItem | null) {
  const id = customer?.id ?? "";
  const has = (role: CustomerItem["roles"][number]) => !!customer?.roles.includes(role);
  const rail = useRailOperator(has("rail_operator") ? id : "");
  const ocean = useShippingLine(has("shipping_line") ? id : "");
  const collection = useCollectionHaulier(has("first_last_mile_haulier") ? id : "");

  const summaries: SupplierTariffSummary[] = [];
  if (rail.detail) summaries.push({ role: "rail_operator", label: "Rail tariffs", href: `/tariffs/rail-operators/${id}`, ...pick(rail.detail.operator) });
  if (ocean.detail) summaries.push({ role: "shipping_line", label: "Ocean tariffs", href: `/tariffs/shipping-lines/${id}`, ...pick(ocean.detail.line) });
  if (collection.detail) summaries.push({ role: "first_last_mile_haulier", label: "Collection tariffs", href: `/tariffs/collections/${id}`, ...pick(collection.detail.haulier) });

  return {
    summaries,
    // A role asked for whose answer is not in yet: its "no valid tariff" would be untrue.
    isLoading: (has("rail_operator") && rail.isLoading) || (has("shipping_line") && ocean.isLoading) || (has("first_last_mile_haulier") && collection.isLoading),
    isError: !!(rail.error || ocean.error || collection.error),
    /** Whether the company has a role Tariffs keeps tariffs for. */
    hasTariffRole: has("rail_operator") || has("shipping_line") || has("first_last_mile_haulier"),
  };
}

const pick = (item: { tariffCount: number; activeCount: number; activeUntil: string | null; coveredUntil: string | null }) => ({
  tariffCount: item.tariffCount,
  activeCount: item.activeCount,
  activeUntil: item.activeUntil,
  coveredUntil: item.coveredUntil,
});
