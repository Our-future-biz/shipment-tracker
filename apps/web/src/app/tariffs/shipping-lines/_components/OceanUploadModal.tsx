"use client";

import { useState } from "react";
import { useOceanTariffActions, type OceanTariffItem } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { directionsText } from "../../_lib/railTariffs";
import { TariffUploadModal } from "../../_components/TariffUploadModal";
import type { TariffUploadSlot } from "../../_components/TariffSupplierView";
import { OceanDirectionFields } from "./OceanDirectionFields";

interface OceanUploadModalProps extends TariffUploadSlot {
  supplierCustomerId: string;
  supplierName: string;
  tariffs: OceanTariffItem[];
}

// Upload of a shipping line's rate document: a new version of one of its tariffs (next month's
// rates) or a new tariff, for which the user first ticks import, export or both. The AI reads where
// the rate tables and surcharges are, the code reads every rate and matches the ports to the
// UN/LOCODE list.
export function OceanUploadModal({ supplierCustomerId, tariffs, ...props }: OceanUploadModalProps) {
  const { upload, isUploading } = useOceanTariffActions();
  const [directions, setDirections] = useState<interfaces.RailDirection[]>([]);
  return (
    <TariffUploadModal
      {...props}
      tariffs={tariffs.map((t) => ({ id: t.id, name: t.name, forText: directionsText(t.directions) }))}
      upload={(tariffId, file) => upload({ supplierCustomerId, ...(tariffId ? { tariffId } : { directions }), ...file })}
      isUploading={isUploading}
      newTariff={{
        question: "Is the new tariff for import, export or both?",
        fields: <OceanDirectionFields value={directions} onChange={setDirections} disabled={isUploading} />,
        problem: directions.length ? null : "Tick import, export or both",
      }}
      texts={{
        nextVersion: "next month's rates",
        another: "another rate document of this shipping line",
        file: "the shipping line's rate document",
        hint: "Excel (.xlsx, .xlsm) or CSV, up to 10 MB, as the shipping line sent it. The AI reads the rate tables and surcharges, and the ports are matched to the UN/LOCODE list. It becomes a draft; nothing prices with it until a manager approves it.",
        reading: "the AI works out where the rate tables and surcharges are, then every rate is read and every port matched. This can take up to two minutes.",
      }}
    />
  );
}
