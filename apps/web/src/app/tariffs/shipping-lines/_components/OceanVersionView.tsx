"use client";

import { fetchOceanTariffSource, useOceanTariffActions, useOceanTariffVersion } from "@/hooks/useOceanTariffs";
import { formatNumber } from "@/lib/number";
import { shippingLineHref } from "../../_lib/oceanTariffs";
import { TariffVersionView } from "../../_components/TariffVersionView";
import { useTariffRelayout } from "../../_components/useTariffRelayout";
import { DirectionChips } from "./OceanDirectionFields";
import { OceanVersionLayoutCard } from "./OceanVersionLayoutCard";
import { OceanVersionPorts } from "./OceanVersionPorts";
import { OceanVersionRates } from "./OceanVersionRates";
import { OceanVersionSurcharges } from "./OceanVersionSurcharges";

interface OceanVersionViewProps {
  customerId: string;
  versionId: string;
}

// One version of a shipping line's tariff: what was uploaded and how it was read, what the checks
// found, its ports, rates and surcharges. A manager matches the ports the code could not and
// corrects a draft's layout, then approves the draft (it prices from its start date) or discards it.
export const OceanVersionView = ({ customerId, versionId }: OceanVersionViewProps) => {
  const { version, isLoading, error } = useOceanTariffVersion(versionId);
  const { relayout, isRelayouting, approve, isApproving, discard, isDiscarding } = useOceanTariffActions();
  const handleRelayout = useTariffRelayout(relayout, (read) => `${formatNumber(read.rowCount)} rates, ${read.pendingPorts} ports to pick`);

  return (
    <TariffVersionView
      version={version}
      isLoading={isLoading}
      error={error}
      backHref={shippingLineHref(customerId)}
      supplierLabel="Shipping line"
      titleChips={(v) => <DirectionChips directions={v.tariff.directions} />}
      rowsText={(v) => `${formatNumber(v.rowCount)} rates`}
      moreFacts={(v) => v.pendingPorts > 0 && <span className="text-amber-700">{v.pendingPorts} ports to pick</span>}
      approveBlockedBy={(v) => (v.pendingPorts > 0 ? "Pick the ports still to match first" : null)}
      actions={{ approve, isApproving, discard, isDiscarding, fetchSource: fetchOceanTariffSource }}
      discardDescription="The draft and everything read from it are thrown away. Upload the file again to start over."
    >
      {(v, editable) => (
        <>
          <OceanVersionPorts version={v} editable={editable} />
          <OceanVersionRates version={v} />
          <OceanVersionSurcharges layout={v.layout} />
          <OceanVersionLayoutCard version={v} editable={editable} isRelayouting={isRelayouting} onRelayout={(layout) => handleRelayout(v.id, layout)} />
        </>
      )}
    </TariffVersionView>
  );
};
