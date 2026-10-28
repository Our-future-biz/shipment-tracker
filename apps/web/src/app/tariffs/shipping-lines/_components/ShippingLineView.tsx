"use client";

import { useOceanTariffActions, useShippingLine, type OceanTariffItem } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { oceanVersionHref } from "../../_lib/oceanTariffs";
import { TARIFF_PAGES } from "../../_lib/tariffPages";
import { TariffSupplierView } from "../../_components/TariffSupplierView";
import { DirectionChips, OceanDirectionFields } from "./OceanDirectionFields";
import { OceanUploadModal } from "./OceanUploadModal";

interface DirectionFields {
  directions: interfaces.RailDirection[];
}

// One shipping line: its tariffs, each with whether it is for import, export or both and its
// versions (newest first). A manager uploads a rate document here and edits a tariff's name and
// directions.
export function ShippingLineView({ customerId }: { customerId: string }) {
  const { detail, isLoading, error } = useShippingLine(customerId);
  const { update, isUpdating } = useOceanTariffActions();
  const tariffs = detail?.tariffs ?? [];

  return (
    <TariffSupplierView<OceanTariffItem, DirectionFields>
      customerId={customerId}
      section={TARIFF_PAGES.shippingLines}
      role="shipping_line"
      noun="shipping line"
      supplier={detail?.line ?? null}
      tariffs={tariffs}
      isLoading={isLoading}
      error={error}
      versionHref={oceanVersionHref}
      rowsTitle="Rates"
      uploadHint="Upload the shipping line's rate document (Excel) as they sent it; the AI reads where its rate tables and surcharges are, the ports are matched to the UN/LOCODE list, and you check the result before it is used."
      renderFor={(tariff) => (
        <>
          <span className="text-[12px] text-slate-500 mr-1">For</span>
          <DirectionChips directions={tariff.directions} />
        </>
      )}
      edit={{
        tooltip: "Edit the tariff's name and whether it is for import or export",
        fieldsOf: (t) => ({ directions: t.directions }),
        problem: (f) => (f.directions.length ? null : "Tick import, export or both"),
        renderFields: (value, onChange, disabled) => <OceanDirectionFields value={value.directions} onChange={(directions) => onChange({ directions })} disabled={disabled} />,
        save: update,
        isSaving: isUpdating,
        footnote: "The tariff's versions and rates stay as they are.",
      }}
      renderUpload={(slot) => <OceanUploadModal {...slot} supplierCustomerId={customerId} supplierName={detail?.line.companyName ?? ""} tariffs={tariffs} />}
    />
  );
}
