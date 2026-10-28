"use client";

import { collectionTariffKeys, useCollectionHauliers, type CollectionHaulierItem } from "@/hooks/useCollectionTariffs";
import { collectionHaulierHref, freightModesText } from "../../_lib/collectionTariffs";
import { TARIFF_PAGES } from "../../_lib/tariffPages";
import { TariffSuppliersView, forColumn } from "../../_components/TariffSuppliersView";
import { CollectionHubsCard } from "./CollectionHubsCard";

const FOR_COLUMNS = [forColumn<CollectionHaulierItem>("freight", "Freight", (h) => freightModesText(h.freightModes))];

// Tariffs → Last / First Mile Collections: our hubs, and every Customer Database company with the
// First / last mile haulier role with its tariffs at a glance. A row opens the haulier, where its
// tariffs are uploaded and checked.
export function CollectionHauliersView() {
  const { hauliers, isLoading, error } = useCollectionHauliers();
  return (
    <TariffSuppliersView<CollectionHaulierItem>
      title={TARIFF_PAGES.collections.label}
      role="first_last_mile_haulier"
      nameTitle="Haulier"
      plural="first / last mile hauliers"
      addLabel="Add haulier"
      searchPlaceholder="Search haulier, IČO, city…"
      suppliers={hauliers}
      isLoading={isLoading}
      error={error}
      href={collectionHaulierHref}
      forColumns={FOR_COLUMNS}
      queryKey={collectionTariffKeys.all}
      storageKey="tariffs:collection-hauliers:v1"
      exportFilePrefix="collection-hauliers"
      above={<CollectionHubsCard />}
    />
  );
}
