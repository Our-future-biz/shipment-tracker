"use client";

import { fetchCollectionTariffSource, useCollectionTariffActions, useCollectionTariffVersion } from "@/hooks/useCollectionTariffs";
import { formatNumber } from "@/lib/number";
import { collectionHaulierHref } from "../../_lib/collectionTariffs";
import { TariffVersionView } from "../../_components/TariffVersionView";
import { useTariffRelayout } from "../../_components/useTariffRelayout";
import { FreightChips } from "./CollectionFreightFields";
import { CollectionTryRoute } from "./CollectionTryRoute";
import { CollectionVersionLayoutCard } from "./CollectionVersionLayoutCard";
import { CollectionVersionTables } from "./CollectionVersionTables";

interface CollectionVersionViewProps {
  customerId: string;
  versionId: string;
}

const weightRowsText = (n: number) => `${formatNumber(n)} weight rows`;

// One version of a first / last mile haulier's tariff: what was uploaded and how it was read, what
// the checks found, the price tables, and a route to try it on. A manager corrects a draft's
// layout, then approves the draft (it prices from its start date) or discards it.
export const CollectionVersionView = ({ customerId, versionId }: CollectionVersionViewProps) => {
  const { version, isLoading, error } = useCollectionTariffVersion(versionId);
  const { relayout, isRelayouting, approve, isApproving, discard, isDiscarding } = useCollectionTariffActions();
  const handleRelayout = useTariffRelayout(relayout, (read) => weightRowsText(read.rowCount));

  return (
    <TariffVersionView
      version={version}
      isLoading={isLoading}
      error={error}
      backHref={collectionHaulierHref(customerId)}
      supplierLabel="First / last mile haulier"
      titleChips={(v) => <FreightChips modes={v.tariff.freightModes} />}
      rowsText={(v) => weightRowsText(v.rowCount)}
      actions={{ approve, isApproving, discard, isDiscarding, fetchSource: fetchCollectionTariffSource }}
      discardDescription="The draft and everything read from it are thrown away. Upload the file again to start over."
    >
      {(v, editable) => (
        <>
          <CollectionVersionTables version={v} />
          <CollectionTryRoute version={v} />
          <CollectionVersionLayoutCard version={v} editable={editable} isRelayouting={isRelayouting} onRelayout={(layout) => handleRelayout(v.id, layout)} />
        </>
      )}
    </TariffVersionView>
  );
};
