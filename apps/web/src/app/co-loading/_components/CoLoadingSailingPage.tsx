"use client";

import { useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { BackLink } from "@/components/BackLink";
import { useCoLoadingSailing, useCoLoadingService, useSailingEarnings, useSailingUtilization } from "@/hooks/useCoLoadingServices";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { BTN, CARD, EMPTY, LABEL_TEXT, PAGE_TITLE, REF } from "@/styles/ui";
import { containersWords, fillOfBox } from "../_lib/boxUtilization";
import { SAILING_TABS, sailingTabOf, sailingTabsFor, sailingTitle } from "../_lib/sailings";
import { canManageServices } from "../_lib/services";
import { profitGlance, sailingProfitOf } from "../_lib/earnings";
import { BoxFillChip } from "./BoxFillChip";
import { EditSailingModal } from "./EditSailingModal";
import { BoxUtilizationTab } from "./BoxUtilizationTab";
import { EarningsTab } from "./EarningsTab";
import { SailingShipmentsTab } from "./SailingShipmentsTab";

// One fact of the sailing, as the master job's summary card shows its own: the label over the value.
function Fact({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`${LABEL_TEXT} break-words`}>{label}</div>
      <div className="mt-0.5 min-h-[22px] flex items-center text-[13px] font-medium text-slate-900 min-w-0">
        {children}
      </div>
    </div>
  );
}

const text = (v: string | null | undefined) =>
  v ? (
    <span className="truncate" title={v}>
      {v}
    </span>
  ) : (
    <span className={EMPTY}>—</span>
  );

/**
 * A Co-Loading Concept sailing's own page, opened from its service's Sailings list, in the master
 * job page's shape: a white header band with the way back, the sailing at a glance and the tab strip,
 * then the tab. Its tabs are Box utilization (how full its box is: BoxUtilizationTab), Linked shipments (the shipments in its box:
 * SailingShipmentsTab) and Earnings (what its shipments earn: EarningsTab, for managers and admins only). The tab is kept in the address (?tab=), so a reload or a link keeps it.
 */
export function CoLoadingSailingPage() {
  const { sailingId } = useParams<{ serviceId: string; sailingId: string }>();
  const { sailing, isLoading, notFound } = useCoLoadingSailing(sailingId);
  const { service } = useCoLoadingService(sailing?.serviceId ?? "");
  // How full the box is stands in the header on every tab.
  const { box } = useSailingUtilization(sailing?.id ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isManager = canManageServices(user?.role);
  const tab = sailingTabOf(searchParams.get("tab"), isManager);
  // Managers see the sailing's profit in the header on every tab (D19).
  const { earnings, isError: earningsFailed } = useSailingEarnings(sailing?.id ?? "", isManager);
  // A failed read says so (profitGlance of nothing); while it is still being read, a dash.
  const profit = earnings ? profitGlance(sailingProfitOf(sailing?.id ?? "", earnings)) : earningsFailed ? profitGlance(null) : null;
  const [editing, setEditing] = useState(false);
  const openTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === SAILING_TABS[0].key) params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-3.5 pb-0">
        <div className="flex items-center justify-between gap-x-6 gap-y-2 flex-wrap min-h-8">
          {/* Back to the service the sailing is on, by its name once it is known. */}
          <BackLink href={sailing ? `/co-loading/${sailing.serviceId}` : "/co-loading"}>
            {service?.name ?? "Co-Loading Concept"}
          </BackLink>
          {/* Its number of containers and its cut-off; not while the service is closed. */}
          {sailing && service && !service.closedAt && (
            <button type="button" className={BTN} onClick={() => setEditing(true)}>
              Edit sailing
            </button>
          )}
          {sailing && <EditSailingModal open={editing} onClose={() => setEditing(false)} sailing={sailing} isManager={isManager} />}
        </div>

        {sailing && (
          <>
            {/* The sailing at a glance - its vessel first - above the tabs, on every tab */}
            <div className={`${CARD} mt-3 px-5 pt-3 pb-2.5`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-3 xl:[&>*:nth-child(n+7)]:pt-1.5 xl:[&>*:nth-child(n+7)]:border-t xl:[&>*:nth-child(n+7)]:border-indigo-100">
                <Fact label="Sailing" className="col-span-full sm:col-span-1">
                  <h1 className={`${PAGE_TITLE} ${REF} truncate`} title={sailingTitle(sailing)}>
                    {sailing.vessel}
                  </h1>
                </Fact>
                <Fact label="Voyage">{text(sailing.voyage)}</Fact>
                <Fact label="Service">{text(service?.name)}</Fact>
                <Fact label="Service Name">{text(service?.serviceName)}</Fact>
                <Fact label="Container Type">{text(containersWords(sailing))}</Fact>
                <Fact label="Created">
                  {text(
                    [formatDate(sailing.createdAt), sailing.createdByName]
                      .filter(Boolean)
                      .join(" · "),
                  )}
                </Fact>
                <Fact label="Port of Loading">{text(sailing.pol)}</Fact>
                <Fact label="Port of Discharge">{text(sailing.pod)}</Fact>
                <Fact label="HUB">{text(sailing.hub)}</Fact>
                <Fact label="Box utilization">{box ? <BoxFillChip fill={fillOfBox(box)} /> : text(null)}</Fact>
                {/* One fact for the two dates, so a manager's Profit closes the second row instead of standing alone on a third. */}
                <Fact label="Cut-off · Departure">{text(`${formatDate(sailing.cutoffDate) || "—"} · ${formatDate(sailing.departureDate) || "—"}`)}</Fact>
                {isManager && (
                  <Fact label="Profit">
                    {profit ? (
                      <span
                        className={`truncate tabular-nums ${profit.tone === "red" ? "text-red-600" : profit.tone === "amber" ? "text-amber-700" : profit.tone === "slate" ? "font-normal text-slate-500" : ""}`}
                        title={[profit.main, profit.note].filter(Boolean).join(" · ")}
                      >
                        {profit.main}
                        {profit.note && <span className="font-normal text-slate-500"> · {profit.note}</span>}
                      </span>
                    ) : (
                      text(null)
                    )}
                  </Fact>
                )}
              </div>
            </div>

            {/* Tabs, in the master job header's look */}
            <nav aria-label="Sailing sections" className="flex gap-0 mt-3.5 -mb-px overflow-x-auto">
              {sailingTabsFor(isManager).map((t) => {
                const selected = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-current={selected ? "page" : undefined}
                    onClick={() => openTab(t.key)}
                    className={`px-[9px] min-[1400px]:px-3.5 2xl:px-4 py-2.5 text-[13px] whitespace-nowrap cursor-pointer transition-colors bg-transparent border-0 border-b-2 ${
                      selected
                        ? "font-semibold text-indigo-600 border-indigo-600"
                        : "font-medium text-slate-500 border-transparent hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </>
        )}
        {!sailing && <div className="h-3.5" />}
      </div>

      {/* ── Tab content ── */}
      <div className="px-4 md:px-6 pt-4 pb-8">
        {sailing && tab === "shipments" ? (
          // Wait for the service: its Service Name says which shipments go in the box, and a closed
          // one takes nothing new.
          service ? (
            <SailingShipmentsTab
              sailing={sailing}
              serviceName={service.serviceName}
              serviceMode={service.mode}
              closed={!!service.closedAt}
            />
          ) : (
            <div className="flex justify-center p-20">
              <Spin size="large" />
            </div>
          )
        ) : sailing && tab === "box" ? (
          <BoxUtilizationTab sailingId={sailing.id} onOpenShipments={() => openTab("shipments")} />
        ) : sailing ? (
          <EarningsTab sailingId={sailing.id} containerType={sailing.containerType} closed={!!service?.closedAt} onOpenShipments={() => openTab("shipments")} />
        ) : isLoading ? (
          <div className="flex justify-center p-20">
            <Spin size="large" />
          </div>
        ) : (
          <div className="p-10 text-center text-slate-500">
            {notFound ? "Sailing not found." : "Could not load the sailing."}
          </div>
        )}
      </div>
    </div>
  );
}
