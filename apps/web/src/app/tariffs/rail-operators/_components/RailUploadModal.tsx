"use client";

import { useState } from "react";
import { useRailTariffActions, type RailTariffItem } from "@/hooks/useRailTariffs";
import { portsAndDirectionsProblem, tariffForText } from "../../_lib/railTariffs";
import { TariffUploadModal } from "../../_components/TariffUploadModal";
import type { TariffUploadSlot } from "../../_components/TariffSupplierView";
import { NO_PORTS_AND_DIRECTIONS, RailTariffPortsFields, type PortsAndDirections } from "./RailTariffPortsFields";

interface RailUploadModalProps extends TariffUploadSlot {
  supplierCustomerId: string;
  supplierName: string;
  tariffs: RailTariffItem[];
}

// Upload of a rail operator's tariff file: a new version of one of its tariffs (next year's
// prices) or a new tariff (another price list), for which the user first ticks the ports and
// import / export.
export function RailUploadModal({ supplierCustomerId, tariffs, ...props }: RailUploadModalProps) {
  const { upload, isUploading } = useRailTariffActions();
  const [forNew, setForNew] = useState<PortsAndDirections>(NO_PORTS_AND_DIRECTIONS);
  return (
    <TariffUploadModal
      {...props}
      tariffs={tariffs.map((t) => ({ id: t.id, name: t.name, forText: tariffForText(t) }))}
      upload={(tariffId, file) => upload({ supplierCustomerId, ...(tariffId ? { tariffId } : forNew), ...file })}
      isUploading={isUploading}
      newTariff={{
        question: "What is the new tariff for? Tick every port its prices run from or to.",
        fields: <RailTariffPortsFields value={forNew} onChange={setForNew} disabled={isUploading} />,
        problem: portsAndDirectionsProblem(forNew),
      }}
      texts={{
        nextVersion: "next year's prices",
        another: "another price list of this operator",
        file: "the operator's tariff file",
        hint: "Excel (.xlsx) or CSV, up to 10 MB, as the operator sent it. It becomes a draft; nothing prices with it until a manager approves it.",
        reading: "the AI works out the layout, then every row is read and checked. This can take up to a minute.",
      }}
    />
  );
}
