"use client";

import Link from "next/link";
import { Alert, Spin } from "antd";
import { Pill } from "@/components/Pill";
import { SectionCard } from "@/components/SectionCard";
import { useMasterJobTracking, type MasterJobTrackingHouse } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { CARD, EMPTY, EMPTY_STATE, HINT, LINK, REF, TD, TH } from "@/styles/ui";

const Day = ({ day }: { day: string | null }) => (day ? <span className="tabular-nums">{formatDate(day)}</span> : <span className={EMPTY}>—</span>);

function HouseRow({ house }: { house: MasterJobTrackingHouse }) {
  return (
    <tr>
      <td className={TD}>
        <Link href={`/shipments/${house.shipmentId}?tab=tracking`} className={`${LINK} ${REF}`}>
          {house.jobNumber}
        </Link>
        {house.customer && <div className={HINT}>{house.customer}</div>}
      </td>
      <td className={TD}><Day day={house.departed} /></td>
      <td className={TD}><Day day={house.arrived} /></td>
      <td className={TD}>{house.customsCleared ? <Pill tone="green">Cleared</Pill> : house.customsStatus ? <span className={HINT}>{house.customsStatus}</span> : <span className={EMPTY}>—</span>}</td>
      <td className={TD}><Day day={house.gateIn} /></td>
      <td className={TD}><Day day={house.delivered} /></td>
      <td className={TD}>{house.lastEvent || <span className={EMPTY}>—</span>}</td>
    </tr>
  );
}

/** The master job's houses side by side: the dates it owns are shared, what happens after differs per house. */
export function MasterJobTrackingTab({ masterJobId }: { masterJobId: string }) {
  const { data: houses, isLoading, error } = useMasterJobTracking(masterJobId);
  if (isLoading) {
    return (
      <div className={`${CARD} p-8 flex justify-center`}>
        <Spin />
      </div>
    );
  }
  if (!houses) return <Alert type="error" showIcon message={`Could not load the tracking: ${apiErrorMessage(error)}`} />;

  return (
    <SectionCard title="Houses" extra={<span className={HINT}>ATD and ATA are set on the master job</span>} bodyClassName="p-0">
      {houses.length === 0 ? (
        <p className={EMPTY_STATE}>No shipments linked yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse [&_td:first-child]:!pl-4 [&_th:first-child]:!pl-4">
            <thead>
              <tr>
                <th className={TH}>Shipment</th>
                <th className={TH}>Departed</th>
                <th className={TH}>Arrived</th>
                <th className={TH}>Customs</th>
                <th className={TH}>Gate in</th>
                <th className={TH}>Delivered</th>
                <th className={TH}>Last event</th>
              </tr>
            </thead>
            <tbody>
              {houses.map((house) => (
                <HouseRow key={house.shipmentId} house={house} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
