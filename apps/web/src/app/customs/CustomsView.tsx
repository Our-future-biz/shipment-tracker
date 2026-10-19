"use client";

import { useMemo, useState } from "react";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useShipments } from "@/hooks/useShipments";
import { useShipment } from "@/hooks/useShipment";
import { useDebounced } from "@/hooks/useDebounced";
import { CountToggleButton } from "@/components/CountToggleButton";
import { ShipmentsTable } from "@/app/shipments/_components/ShipmentsTable";
import { CustomsSummary, CustomsShipmentInfo } from "./CustomsOverview";
import { CustomsTab } from "@/app/shipments/[jobNumber]/tabs/CustomsTab";
import { CustomsInvoicing } from "./CustomsInvoicing";

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

// "Urgents in next 24hrs" moves with the clock, so what depends on it is refreshed this often.
const URGENT_REFRESH_MS = 60_000;

// Tabs of a shipment opened in Customs.
const CUSTOMS_DETAIL_TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "documents", label: "Documents" },
  { key: "invoicing", label: "Invoicing" },
] as const;

// Customs as a view of the shipments: the Shipments table itself over the same live rows,
// with its own columns, filters and their templates. A reference opens the shipment inside
// Customs (?open=<id>) — the same interface as the Customs tab in the shipment detail.
export function CustomsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = useDebounced(searchParams.get("q") ?? "", 300);
  const openId = searchParams.get("open");
  // Clicking the count narrows the list to those shipments (?urgent=1); clicking again clears it.
  // The filter runs on the server over every shipment: an Urgent one with a Prague deadline
  // within the next 24 hours or passed, not yet released by customs.
  const urgentOnly = searchParams.get("urgent") === "1";
  const { shipments, total, isLoading, updateField } = useShipments({
    search,
    customs: urgentOnly ? "urgent" : undefined,
    refetchInterval: urgentOnly ? URGENT_REFRESH_MS : undefined,
  });

  // The list holds the newest 200; a shipment opened by link may be older, so it is fetched on its own.
  const listed = openId ? shipments.find((x) => x.id === openId) : undefined;
  const fetched = useShipment(!isLoading && !listed ? (openId ?? undefined) : undefined);
  const openShipment = listed ?? fetched.shipment ?? null;
  // Every shipment opens on its first tab: the chosen tab belongs to the shipment it was picked on.
  type DetailTab = (typeof CUSTOMS_DETAIL_TABS)[number]["key"];
  const [tabPick, setTabPick] = useState<{ id: string | null; tab: DetailTab }>({ id: openId, tab: "details" });
  const detailTab: DetailTab = tabPick.id === openId ? tabPick.tab : "details";
  const setDetailTab = (tab: DetailTab) => setTabPick({ id: openId, tab });

  // The count of those shipments, over all of them whatever the list is searched by. Kept under
  // ["shipments"] so every shipment write refreshes it, and re-counted as the clock moves.
  const urgentCount = useQuery({
    queryKey: ["shipments", "customs-urgent-count"],
    queryFn: () => api.shipments.shipmentList({ customs: "urgent", limit: 1 }),
    refetchInterval: URGENT_REFRESH_MS,
  });
  const urgentSoon = urgentCount.data?.pagination.total ?? 0;

  const toggleUrgentOnly = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (urgentOnly) params.delete("urgent");
    else params.set("urgent", "1");
    const qs = params.toString();
    router.replace(qs ? `/customs?${qs}` : "/customs", { scroll: false });
  };

  // Back to the list as it was left: its search and filters stay, only the opened shipment goes.
  const backToList = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("open");
    const qs = params.toString();
    router.push(qs ? `/customs?${qs}` : "/customs");
  };

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
                  onClick={backToList}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-line-soft bg-white text-slate-900 text-[17px] font-bold cursor-pointer hover:bg-surface-2 hover:text-ink-soft transition-colors"
                >
                  <ArrowLeftOutlined /> Customs
                </button>
                {openShipment && (
                  <span className="font-mono text-[18px] font-bold tracking-[.02em] text-ink-strong">
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
              {openShipment && detailTab === "invoicing" ? (
                <CustomsInvoicing shipment={openShipment} />
              ) : openShipment ? (
                <div className="flex flex-col gap-3">
                  {detailTab === "details" && <CustomsSummary shipment={openShipment} />}
                  <CustomsTab
                    canReview
                    section={detailTab === "documents" ? "documents" : "details"}
                    shipment={openShipment}
                    onCommit={(fieldKey, value) => updateField(openShipment.id, fieldKey, value, openShipment)}
                  />
                  {detailTab === "details" && <CustomsShipmentInfo shipment={openShipment} />}
                </div>
              ) : isLoading || fetched.isLoading ? (
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
            cap={{ shown: shipments.length, total }}
            isLoading={isLoading}
            toolbarLead={
              <CountToggleButton
                label="Urgents in next 24hrs"
                count={urgentSoon}
                active={urgentOnly}
                onToggle={toggleUrgentOnly}
                title={urgentOnly ? "Show all shipments" : "Show only these shipments"}
              />
            }
            view={{ key: "customs", title: "Customs", detailHref: "/customs?open=:id", defaultColumns: CUSTOMS_DEFAULT_COLUMNS, readonlyColumns: CUSTOMS_READONLY_COLUMNS, quickFilter: CUSTOMS_QUICK_FILTER }}
          />
        )}
      </div>
    </div>
  );
}
