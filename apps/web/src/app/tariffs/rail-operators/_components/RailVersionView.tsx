"use client";

import { fetchRailTariffSource, useRailTariffActions, useRailTariffVersion } from "@/hooks/useRailTariffs";
import { formatNumber } from "@/lib/number";
import { railOperatorHref, tariffForText } from "../../_lib/railTariffs";
import { TariffVersionView } from "../../_components/TariffVersionView";
import { useTariffRelayout } from "../../_components/useTariffRelayout";
import { RailVersionLayoutCard } from "./RailVersionLayoutCard";
import { RailVersionRates } from "./RailVersionRates";

interface RailVersionViewProps {
  customerId: string;
  versionId: string;
}

// One version of a rail operator's tariff: what was uploaded and how it was read, what the checks
// found, and every row with its prices. A manager corrects a draft's layout, then approves the
// draft (it prices from its start date) or discards it.
export const RailVersionView = ({ customerId, versionId }: RailVersionViewProps) => {
  const { version, isLoading, error } = useRailTariffVersion(versionId);
  const { relayout, isRelayouting, approve, isApproving, discard, isDiscarding } = useRailTariffActions();
  const handleRelayout = useTariffRelayout(relayout, (read) => `${formatNumber(read.rowCount)} rows`);

  return (
    <TariffVersionView
      version={version}
      isLoading={isLoading}
      error={error}
      backHref={railOperatorHref(customerId)}
      supplierLabel="Rail operator"
      forText={(v) => tariffForText(v.tariff)}
      rowsText={(v) => `${formatNumber(v.rowCount)} rows`}
      actions={{ approve, isApproving, discard, isDiscarding, fetchSource: fetchRailTariffSource }}
      discardDescription="The draft and the rows read from it are thrown away. Upload the file again to start over."
    >
      {(v, editable) => (
        <>
          <RailVersionLayoutCard version={v} editable={editable} isRelayouting={isRelayouting} onRelayout={(layout) => handleRelayout(v.id, layout)} />
          <RailVersionRates version={v} />
        </>
      )}
    </TariffVersionView>
  );
};
