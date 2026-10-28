"use client";

import { useRailOperator, useRailTariffActions, type RailTariffItem } from "@/hooks/useRailTariffs";
import { DIRECTIONS, TARIFF_PORTS, portsAndDirectionsProblem, railVersionHref } from "../../_lib/railTariffs";
import { TARIFF_PAGES } from "../../_lib/tariffPages";
import { TariffSupplierView } from "../../_components/TariffSupplierView";
import { RailTariffPortsFields, type PortsAndDirections } from "./RailTariffPortsFields";
import { RailUploadModal } from "./RailUploadModal";

const CHIP = "inline-block rounded-full border px-2 py-0.5 text-[11.5px] font-medium";

// What a tariff is for, above its versions: its ports, then import / export.
const RailTariffFor = ({ tariff }: { tariff: RailTariffItem }) => (
  <>
    {TARIFF_PORTS.filter((p) => tariff.ports.includes(p.code)).map((p) => (
      <span key={p.code} className={`${CHIP} bg-indigo-50 text-indigo-700 border-indigo-200`}>
        {p.name}
      </span>
    ))}
    <span aria-hidden className="mx-1 h-4 w-px bg-slate-200" />
    {DIRECTIONS.filter((d) => tariff.directions.includes(d.value)).map((d) => (
      <span key={d.value} className={`${CHIP} bg-slate-100 text-slate-600 border-slate-200`}>
        {d.label}
      </span>
    ))}
  </>
);

// One rail operator: its tariffs, each with the ports it is for, import / export and its versions
// (newest first). A manager uploads a file here and edits a tariff's name, ports and directions.
export function RailOperatorView({ customerId }: { customerId: string }) {
  const { detail, isLoading, error } = useRailOperator(customerId);
  const { update, isUpdating } = useRailTariffActions();
  const tariffs = detail?.tariffs ?? [];

  return (
    <TariffSupplierView<RailTariffItem, PortsAndDirections>
      customerId={customerId}
      section={TARIFF_PAGES.railOperators}
      role="rail_operator"
      noun="rail operator"
      supplier={detail?.operator ?? null}
      tariffs={tariffs}
      isLoading={isLoading}
      error={error}
      versionHref={railVersionHref}
      rowsTitle="Places"
      uploadHint="Upload the operator's tariff file (Excel) as they sent it; the AI reads its layout and you check the result before it is used."
      renderFor={(tariff) => <RailTariffFor tariff={tariff} />}
      edit={{
        tooltip: "Edit the tariff's name, ports and direction",
        fieldsOf: (t) => ({ ports: t.ports, directions: t.directions }),
        problem: portsAndDirectionsProblem,
        renderFields: (value, onChange, disabled) => <RailTariffPortsFields value={value} onChange={onChange} disabled={disabled} />,
        save: update,
        isSaving: isUpdating,
        footnote: "The tariff's versions and prices stay as they are.",
      }}
      renderUpload={(slot) => <RailUploadModal {...slot} supplierCustomerId={customerId} supplierName={detail?.operator.companyName ?? ""} tariffs={tariffs} />}
    />
  );
}
