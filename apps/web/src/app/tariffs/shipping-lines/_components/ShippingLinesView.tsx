"use client";

import { oceanTariffKeys, useShippingLines, type ShippingLineItem } from "@/hooks/useOceanTariffs";
import { shippingLineHref } from "../../_lib/oceanTariffs";
import { directionsText } from "../../_lib/railTariffs";
import { TARIFF_PAGES } from "../../_lib/tariffPages";
import { TariffSuppliersView, forColumn } from "../../_components/TariffSuppliersView";

const FOR_COLUMNS = [forColumn<ShippingLineItem>("directions", "Direction", (l) => directionsText(l.directions))];

// Tariffs → Shipping Lines: every Customer Database company with the Shipping line role and its
// ocean tariffs at a glance. A row opens the line, where its rate documents are uploaded and checked.
export function ShippingLinesView() {
  const { lines, isLoading, error } = useShippingLines();
  return (
    <TariffSuppliersView<ShippingLineItem>
      title={TARIFF_PAGES.shippingLines.label}
      role="shipping_line"
      nameTitle="Shipping line"
      plural="shipping lines"
      addLabel="Add shipping line"
      searchPlaceholder="Search shipping line, IČO, city…"
      suppliers={lines}
      isLoading={isLoading}
      error={error}
      href={shippingLineHref}
      forColumns={FOR_COLUMNS}
      queryKey={oceanTariffKeys.all}
      storageKey="tariffs:shipping-lines:v1"
      exportFilePrefix="shipping-lines"
    />
  );
}
