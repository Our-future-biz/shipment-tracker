"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { invoicingKey, useInvoicing } from "@/hooks/useInvoicing";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { TrackingContainerClock } from "@/hooks/useShipmentTracking";
import { api, apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { BTN_GHOST, BTN_SM, EMPTY, HINT, LINK, REF, TD, TH } from "@/styles/ui";
import { FreeTimeModal } from "./FreeTimeModal";
import { clockStatus, detentionLineOn, freeTimeWords } from "./trackingText";

const DETENTION_CODE = "container_detention";

interface FreeTimeCardProps {
  shipment: ShipmentItem;
  clocks: readonly TrackingContainerClock[];
  mayChangeDetails: boolean;
  onOpen: (tab: string) => void;
}

/** How long each box may stay out before the carrier charges for it. A chargeable one proposes a cost line; only a person adds it. */
export function FreeTimeCard({ shipment, clocks, mayChangeDetails, onOpen }: FreeTimeCardProps) {
  const [editing, setEditing] = useState<TrackingContainerClock | null>(null);
  const { data: costs, isError: costsFailed } = useInvoicing(shipment.id);
  const queryClient = useQueryClient();
  const toast = useToast();
  // A line is proposed only against the costs as they stand: before they are read, its currency,
  // its place and whether it is already there are not known.
  const costsWhy = costs ? "" : costsFailed ? "Could not load the costs: try again later" : "Loading the costs…";

  const addCost = useMutation({
    mutationFn: async (clock: TrackingContainerClock) => {
      if (!costs) throw new Error(costsWhy);
      return api.invoicing.invoicingAddBuyingCost(shipment.id, {
        category: DETENTION_CODE,
        description: `Detention ${clock.containerNumber}: ${clock.chargeableDays} days after ${formatDate(clock.lastFreeDay)}`,
        realQty: String(clock.chargeableDays),
        realCurrency: costs.billingSettings?.billingCurrency || "CZK",
        unit: "day",
        sortOrder: costs.costs.length,
      });
    },
    // Busy until the costs are read again, so a second click can't add the line twice.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoicingKey(shipment.id) });
      onOpen("costs");
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <SectionCard title="Free time" extra={<CountChip count={clocks.length} />} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse [&_td:first-child]:!pl-4 [&_th:first-child]:!pl-4">
          <thead>
            <tr>
              <th className={TH}>Container</th>
              <th className={TH}>Free time</th>
              <th className={TH}>Last free day</th>
              <th className={TH}>Status</th>
              <th className={TH} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {clocks.map((clock) => {
              const status = clockStatus(clock);
              const onCosts = !!costs && detentionLineOn(costs.costs, clock.containerNumber, clocks.length, DETENTION_CODE);
              return (
                <tr key={clock.containerId}>
                  <td className={`${TD} ${REF}`}>{clock.containerNumber}</td>
                  <td className={TD}>{freeTimeWords(clock) || <span className={EMPTY}>—</span>}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{clock.lastFreeDay ? formatDate(clock.lastFreeDay) : <span className={EMPTY}>—</span>}</td>
                  <td className={TD}>
                    {status.tone ? <Pill tone={status.tone}>{status.text}</Pill> : <span className={HINT}>{status.text}</span>}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <span className="inline-flex items-center gap-3">
                      {clock.chargeableDays > 0 &&
                        (onCosts ? (
                          <button type="button" onClick={() => onOpen("costs")} className={`${LINK} cursor-pointer bg-transparent border-none p-0 text-[12px]`}>
                            On Costs
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!costs || addCost.isPending}
                            onClick={() => addCost.mutate(clock)}
                            className={`${BTN_GHOST} ${BTN_SM}`}
                            title={costsWhy || "Adds a line to Costs with the days and no price: you fill in the rest"}
                          >
                            Add a cost line
                          </button>
                        ))}
                      {mayChangeDetails && (
                        <button type="button" onClick={() => setEditing(clock)} className={`${BTN_GHOST} ${BTN_SM}`}>
                          Set
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <FreeTimeModal shipment={shipment} clock={editing} clocks={clocks} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}
