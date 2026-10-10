"use client";

import { useEffect, useMemo, useState } from "react";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useShipments } from "@/hooks/useShipments";
import { useDebounced } from "@/hooks/useDebounced";
import { ShipmentsTable } from "@/app/shipments/_components/ShipmentsTable";
import { CustomsSummary, CustomsShipmentInfo } from "./CustomsOverview";
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

// Tabs of a shipment opened in Customs.
const CUSTOMS_DETAIL_TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "documents", label: "Documents" },
] as const;

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
  const [detailTab, setDetailTab] = useState<(typeof CUSTOMS_DETAIL_TABS)[number]["key"]>("details");
  // Every shipment opens on its first tab.
  useEffect(() => setDetailTab("details"), [openId]);

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
            <div>
              <div className="flex items-center gap-3.5 mb-4">
                <button
                  type="button"
                  onClick={() => router.push("/customs")}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[#d8dce6] bg-white text-slate-900 text-[17px] font-bold cursor-pointer hover:bg-[#f4f5f9] hover:text-[#46506b] transition-colors"
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
              {openShipment && (
                <div className="flex gap-0 mb-4 border-b border-slate-200">
                  {CUSTOMS_DETAIL_TABS.map((tab) => (
                    <div
                      key={tab.key}
                      onClick={() => setDetailTab(tab.key)}
                      className={`px-4 py-2.5 text-sm cursor-pointer transition-all duration-150 border-b-2 -mb-px ${
                        detailTab === tab.key
                          ? "font-semibold text-indigo-500 border-indigo-500"
                          : "font-normal text-slate-400 border-transparent hover:text-slate-600"
                      }`}
                    >
                      {tab.label}
                    </div>
                  ))}
                </div>
              )}
              {openShipment ? (
                <div className="flex flex-col gap-3">
                  {detailTab === "details" && <CustomsSummary shipment={openShipment} />}
                  <CustomsTab
                    canReview
                    section={detailTab}
                    shipment={openShipment}
                    onCommit={(fieldKey, value) => updateField(openShipment.id, fieldKey, value)}
                  />
                  {detailTab === "details" && <CustomsShipmentInfo shipment={openShipment} />}
                </div>
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
