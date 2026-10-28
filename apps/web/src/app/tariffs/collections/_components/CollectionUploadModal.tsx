"use client";

import { useState } from "react";
import { useCollectionTariffActions, type CollectionFreightMode, type CollectionTariffItem } from "@/hooks/useCollectionTariffs";
import { freightModesText } from "../../_lib/collectionTariffs";
import { TariffUploadModal } from "../../_components/TariffUploadModal";
import type { TariffUploadSlot } from "../../_components/TariffSupplierView";
import { CollectionFreightFields } from "./CollectionFreightFields";

interface CollectionUploadModalProps extends TariffUploadSlot {
  supplierCustomerId: string;
  supplierName: string;
  tariffs: CollectionTariffItem[];
}

// Upload of a first / last mile haulier's tariff file: a new version of one of its tariffs (next
// year's prices) or a new tariff, for which the user first ticks what it collects and delivers. The
// AI reads where each part of the file is - hidden sheets too - and every figure is read into a draft.
export function CollectionUploadModal({ supplierCustomerId, tariffs, ...props }: CollectionUploadModalProps) {
  const { upload, isUploading } = useCollectionTariffActions();
  const [freightModes, setFreightModes] = useState<CollectionFreightMode[]>([]);
  return (
    <TariffUploadModal
      {...props}
      tariffs={tariffs.map((t) => ({ id: t.id, name: t.name, forText: freightModesText(t.freightModes) }))}
      upload={(tariffId, file) => upload({ supplierCustomerId, ...(tariffId ? { tariffId } : { freightModes }), ...file })}
      isUploading={isUploading}
      newTariff={{
        question: "What does the new tariff collect and deliver?",
        fields: <CollectionFreightFields value={freightModes} onChange={setFreightModes} disabled={isUploading} />,
        problem: freightModes.length ? null : "Tick Sea LCL, Air or both",
      }}
      texts={{
        nextVersion: "next year's prices",
        another: "another price list of this haulier",
        file: "the haulier's tariff file",
        hint: "Excel (.xlsx, .xlsm) or CSV, up to 10 MB, as the haulier sent it - hidden sheets are read too. It becomes a draft; nothing prices with it until a manager approves it.",
        reading: "the AI works out where the prices, postcodes and distances are, then every figure is read and checked. This can take up to a minute.",
      }}
    />
  );
}
