"use client";

import type { ReactNode } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Spin } from "antd";
import { BackLink } from "@/components/BackLink";
import { useCoLoadingSailing, useCoLoadingService, useSailingUtilization } from "@/hooks/useCoLoadingServices";
import { formatDate } from "@/lib/date";
import { CARD, EMPTY, HINT, LABEL_TEXT, PAGE_TITLE, REF } from "@/styles/ui";
import { fillOfBox } from "../_lib/boxUtilization";
import { SAILING_TABS, sailingTabOf, sailingTitle } from "../_lib/sailings";
import { BoxFillChip } from "./BoxFillChip";
import { BoxUtilizationTab } from "./BoxUtilizationTab";
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
 * SailingShipmentsTab) and Earnings; Earnings is not built yet. The tab is kept in the address (?tab=), so a reload or a link keeps it.
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
  const tab = sailingTabOf(searchParams.get("tab"));
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
                <Fact label="Container Type">{text(sailing.containerType)}</Fact>
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
              </div>
            </div>

            {/* Tabs, in the master job header's look */}
            <nav aria-label="Sailing sections" className="flex gap-0 mt-3.5 -mb-px overflow-x-auto">
              {SAILING_TABS.map((t) => {
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
          <section
            className={`${CARD} px-5 py-4`}
            aria-label={SAILING_TABS.find((t) => t.key === tab)!.label}
          >
            <h2 className="m-0 text-[13px] font-semibold text-slate-900">
              {SAILING_TABS.find((t) => t.key === tab)!.label}
            </h2>
            <p className={`${HINT} m-0 mt-1`}>Coming soon.</p>
          </section>
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
