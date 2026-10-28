"use client";

import { railTariffKeys, useRailOperators, type RailOperatorItem } from "@/hooks/useRailTariffs";
import { directionsText, portsText, railOperatorHref } from "../../_lib/railTariffs";
import { TARIFF_PAGES } from "../../_lib/tariffPages";
import { TariffSuppliersView, forColumn } from "../../_components/TariffSuppliersView";

const FOR_COLUMNS = [forColumn<RailOperatorItem>("ports", "Ports", (o) => portsText(o.ports)), forColumn<RailOperatorItem>("directions", "Direction", (o) => directionsText(o.directions))];

// Tariffs → Rail Operators: every Customer Database company with the Rail operator role and its
// tariffs at a glance. A row opens the operator, where its tariffs are uploaded and checked.
export function RailOperatorsView() {
  const { operators, isLoading, error } = useRailOperators();
  return (
    <TariffSuppliersView<RailOperatorItem>
      title={TARIFF_PAGES.railOperators.label}
      role="rail_operator"
      nameTitle="Rail operator"
      plural="rail operators"
      addLabel="Add rail operator"
      searchPlaceholder="Search operator, IČO, city…"
      suppliers={operators}
      isLoading={isLoading}
      error={error}
      href={railOperatorHref}
      forColumns={FOR_COLUMNS}
      queryKey={railTariffKeys.all}
      storageKey="tariffs:rail-operators:v1"
      exportFilePrefix="rail-operators"
    />
  );
}
