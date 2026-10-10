"use client";

import { useEffect, useMemo, useState } from "react";
import { Spin } from "antd";
import dayjs from "dayjs";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useShipments, type ShipmentItem } from "@/hooks/useShipments";
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

// Customs filters its list by priority where Shipments has the shipment status.
const CUSTOMS_QUICK_FILTER = { column: "customsPriority", allLabel: "All Priorities" };

/**
 * An urgent shipment whose deadline falls within the next 24 hours or has already passed
 * and that customs has not released yet.
 */
function isUrgentSoon(s: ShipmentItem): boolean {
  return (
    s.customsPriority === "Urgent" &&
    !!s.customsDeadline &&
    s.customsStatus !== "Customs Cleared/Released" &&
    dayjs(s.customsDeadline).isBefore(dayjs().add(24, "hour"))
  );
}

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
  const openId = searchParams.get("open");
  const { shipments, isLoading, updateField } = useShipments({ search });

  const openShipment = openId ? shipments.find((x) => x.id === openId) : null;
  const [detailTab, setDetailTab] = useState<(typeof CUSTOMS_DETAIL_TABS)[number]["key"]>("details");
  // Every shipment opens on its first tab.
  useEffect(() => setDetailTab("details"), [openId]);

  // Commercial Invoice Value shows the per-currency total of the cargo lines whenever they
  // carry values (the same rule as the Customs tab); the shipment's own field is the fallback.
  // Urgent shipments whose deadline falls within the next 24 hours or has already passed and
  // that customs has not released yet. Counted over all shipments, whatever the list is
  // searched or filtered by.
  const { shipments: allShipments } = useShipments();
  const urgentSoon = useMemo(() => allShipments.filter(isUrgentSoon).length, [allShipments]);
  // Clicking the count narrows the list to those shipments (?urgent=1); clicking again clears it.
  const urgentOnly = searchParams.get("urgent") === "1";
  const toggleUrgentOnly = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (urgentOnly) params.delete("urgent");
    else params.set("urgent", "1");
    const qs = params.toString();
    router.replace(qs ? `/customs?${qs}` : "/customs", { scroll: false });
  };

  const rows = useMemo(
    () =>
      (urgentOnly ? shipments.filter(isUrgentSoon) : shipments).map((s) =>
        s.civByCurrency ? { ...s, commercialInvoiceValue: s.civByCurrency } : s,
      ),
    [shipments, urgentOnly],
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
            toolbarLead={
              <button
                type="button"
                onClick={toggleUrgentOnly}
                aria-pressed={urgentOnly}
                title={urgentOnly ? "Show all shipments" : "Show only these shipments"}
                className={`flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-lg border text-[13px] font-bold uppercase tracking-wide cursor-pointer transition-colors ${
                  urgentOnly
                    ? "border-red-600 bg-red-50 text-red-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Urgents in next 24hrs
                <span
                  className={`inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-[13px] font-bold ${
                    urgentSoon > 0 ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {urgentSoon}
                </span>
              </button>
            }
            view={{ key: "customs", title: "Customs", detailHref: "/customs?open=:id", defaultColumns: CUSTOMS_DEFAULT_COLUMNS, readonlyColumns: CUSTOMS_READONLY_COLUMNS, quickFilter: CUSTOMS_QUICK_FILTER }}
          />
        )}
      </div>
    </div>
  );
}
