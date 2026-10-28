"use client";

import { useCollectionHaulier, useCollectionTariffActions, type CollectionFreightMode, type CollectionTariffItem } from "@/hooks/useCollectionTariffs";
import { collectionVersionHref } from "../../_lib/collectionTariffs";
import { TARIFF_PAGES } from "../../_lib/tariffPages";
import { TariffSupplierView } from "../../_components/TariffSupplierView";
import { CollectionFreightFields, FreightChips } from "./CollectionFreightFields";
import { CollectionUploadModal } from "./CollectionUploadModal";

interface FreightFields {
  freightModes: CollectionFreightMode[];
}

// One first / last mile haulier: its tariffs, each with the freight it collects and delivers and
// its versions (newest first). A manager uploads a file here and edits a tariff's name and freight.
export function CollectionHaulierView({ customerId }: { customerId: string }) {
  const { detail, isLoading, error } = useCollectionHaulier(customerId);
  const { update, isUpdating } = useCollectionTariffActions();
  const tariffs = detail?.tariffs ?? [];

  return (
    <TariffSupplierView<CollectionTariffItem, FreightFields>
      customerId={customerId}
      section={TARIFF_PAGES.collections}
      role="first_last_mile_haulier"
      noun="first / last mile haulier"
      supplier={detail?.haulier ?? null}
      tariffs={tariffs}
      isLoading={isLoading}
      error={error}
      versionHref={collectionVersionHref}
      rowsTitle="Weight rows"
      uploadHint="Upload the haulier's tariff file (Excel) as they sent it; the AI reads where its prices, postcodes and distances are, and you check the result before it is used."
      renderFor={(tariff) => (
        <>
          <span className="text-[12px] text-slate-500 mr-1">Used for</span>
          <FreightChips modes={tariff.freightModes} />
        </>
      )}
      edit={{
        tooltip: "Edit the tariff's name and what it is used for",
        fieldsOf: (t) => ({ freightModes: t.freightModes }),
        problem: (f) => (f.freightModes.length ? null : "Tick Sea LCL, Air or both"),
        renderFields: (value, onChange, disabled) => (
          <CollectionFreightFields value={value.freightModes} onChange={(freightModes) => onChange({ freightModes })} disabled={disabled} />
        ),
        save: update,
        isSaving: isUpdating,
        footnote: "The tariff's versions and prices stay as they are.",
      }}
      renderUpload={(slot) => <CollectionUploadModal {...slot} supplierCustomerId={customerId} supplierName={detail?.haulier.companyName ?? ""} tariffs={tariffs} />}
    />
  );
}
