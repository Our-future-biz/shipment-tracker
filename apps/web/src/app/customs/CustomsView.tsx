"use client";

import { useMemo } from "react";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useShipments } from "@/hooks/useShipments";
import { useDebounced } from "@/hooks/useDebounced";
import { ShipmentsTable } from "@/app/shipments/_components/ShipmentsTable";
import { CustomsTab } from "@/app/shipments/[jobNumber]/tabs/CustomsTab";

// The columns Customs starts from (CUSTOMS_GRID in the approved mockup); from there the
// user shows, hides and reorders them like in Shipments.
const CUSTOMS_DEFAULT_COLUMNS = [
  "jobNumber",
  "customsStatus",
  "customsPriority",
  "customsDeadline",
  "customsProcedure",
  "mrn",
  "csRecvInvoice",
  "csRecvPacking",
  "typeOfPackages",
  "pcs",
  "cargoDescription",
  "hsCode",
  "totalWeightTons",
  "totalVolumeCbm",
  "containerNumber",
  "sealNumber",
  "containerTypeSummary",
  "commercialInvoice",
  "commercialInvoiceValue",
];

// Commercial Invoice Value is what the cargo lines add up to, so it is not typed in here.
const CUSTOMS_READONLY_COLUMNS = ["commercialInvoiceValue"];

// Customs as a view of the shipments: the Shipments table itself over the same live rows,
// with its own columns, filters and their templates. A reference opens the shipment inside
// Customs (?open=<id>) — the same interface as the Customs tab in the shipment detail.
export function CustomsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = useDebounced(searchParams.get("q") ?? "", 300);
  const statusBucket = searchParams.get("status") ?? "all";
  const openId = searchParams.get("open");
  const { shipments, isLoading, updateField } = useShipments({ search, statusBucket });

  const openShipment = openId ? shipments.find((x) => x.id === openId) : null;

  // Commercial Invoice Value shows the per-currency total of the cargo lines whenever they
  // carry values (the same rule as the Customs tab); the shipment's own field is the fallback.
  const rows = useMemo(
    () => shipments.map((s) => (s.civByCurrency ? { ...s, commercialInvoiceValue: s.civByCurrency } : s)),
    [shipments],
  );

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
        {openId ? (
          <div className="flex flex-col gap-5">
            <h1 className="text-2xl font-bold text-slate-900">Customs</h1>
            <div>
              <div className="flex items-center gap-3.5 mb-4">
                <button
                  type="button"
                  onClick={() => router.push("/customs")}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-[#d8dce6] bg-white text-slate-600 text-[12.5px] font-semibold cursor-pointer hover:bg-[#f4f5f9] hover:text-[#46506b] transition-colors"
                >
                  <ArrowLeftOutlined /> Customs
                </button>
                {openShipment && (
                  <span className="font-mono text-[18px] font-bold tracking-[.02em] text-[#10141f]">
                    {openShipment.jobNumber}
                  </span>
                )}
                {openShipment?.customer && (
                  <span className="text-[13px] font-semibold text-slate-600">{openShipment.customer}</span>
                )}
              </div>
              {openShipment ? (
                <CustomsTab
                  shipment={openShipment}
                  onCommit={(fieldKey, value) => updateField(openShipment.id, fieldKey, value)}
                />
              ) : isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Spin />
                </div>
              ) : (
                <div className="px-3 py-7 text-center text-sm text-slate-400">Shipment not found.</div>
              )}
            </div>
          </div>
        ) : (
          <ShipmentsTable
            shipments={rows}
            isLoading={isLoading}
            view={{ key: "customs", title: "Customs", detailHref: "/customs?open=:id", defaultColumns: CUSTOMS_DEFAULT_COLUMNS, readonlyColumns: CUSTOMS_READONLY_COLUMNS }}
          />
        )}
      </div>
    </div>
  );
}
