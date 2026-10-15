"use client";

import { Alert, Input } from "antd";
import { SectionCard } from "@/components/SectionCard";
import type { interfaces } from "@/lib/api/client";
import { TERMS } from "../../_lib/glossary";
import { pscDigits } from "../../_lib/hauliers";
import { hubIsSet } from "../../_lib/settings";
import { TruckingField } from "../../_components/TruckingField";

interface HubSectionProps {
  hub: interfaces.HubAddress;
  disabled: boolean;
  onChange: (hub: interfaces.HubAddress) => void;
}

// Our warehouse (the hub): every LTL line haul starts or ends here and passes its Gate Log. Pick-up
// runs end here and delivery runs start here; LTL planning waits until the address is set.
export const HubSection = ({ hub, disabled, onChange }: HubSectionProps) => {
  const set = <K extends keyof interfaces.HubAddress>(key: K, value: interfaces.HubAddress[K]) => onChange({ ...hub, [key]: value });
  return (
    <SectionCard title={`Our warehouse (${TERMS.hub.toLowerCase()})`}>
      <div className="flex flex-col gap-3">
        {!hubIsSet(hub) && <Alert type="warning" showIcon message="Not set yet — LTL planning waits until our warehouse's address is saved here." />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TruckingField label="Name">
            <Input aria-label="Warehouse name" maxLength={120} value={hub.name} disabled={disabled} onChange={(e) => set("name", e.target.value)} />
          </TruckingField>
          <TruckingField label="Street">
            <Input aria-label="Warehouse street" maxLength={160} value={hub.street} disabled={disabled} onChange={(e) => set("street", e.target.value)} />
          </TruckingField>
        </div>
        <div className="grid grid-cols-[140px_1fr_80px] gap-3">
          <TruckingField label="PSČ">
            <Input aria-label="Warehouse postcode" inputMode="numeric" maxLength={6} value={hub.postcode} disabled={disabled} onChange={(e) => set("postcode", pscDigits(e.target.value))} />
          </TruckingField>
          <TruckingField label="City">
            <Input aria-label="Warehouse city" maxLength={80} value={hub.city} disabled={disabled} onChange={(e) => set("city", e.target.value)} />
          </TruckingField>
          <TruckingField label="Country">
            <Input aria-label="Warehouse country" value={hub.country} disabled />
          </TruckingField>
        </div>
        <p className="m-0 text-[11px] text-slate-400">
          Pick-up runs end here, delivery runs and line hauls start here, and every truck passes the warehouse Gate Log. The warehouse confirms the gate-in, which starts the {TERMS.ltl} service-level clock.
        </p>
      </div>
    </SectionCard>
  );
};
