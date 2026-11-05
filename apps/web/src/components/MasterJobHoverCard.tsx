"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Spin } from "antd";
import { useMasterJobShipments } from "@/hooks/useMasterJobs";
import { HINT, LINK, REF } from "@/styles/ui";
import { HoverCard } from "./HoverCard";

// Longer than the other cards: a list across the Master job column should not open in passing.
const HOVER_DELAY_S = 1;

interface MasterJobHoverCardProps {
  masterJobId: string;
  mczNumber: string;
  children: ReactNode;
}

// The list of a master job's shipments that appears when the pointer rests on its reference for a
// second. Read when the card opens, not for every grid row.
export function MasterJobHoverCard({ masterJobId, mczNumber, children }: MasterJobHoverCardProps) {
  const [open, setOpen] = useState(false);
  // A click on the reference opens the master job's own window, which the card must not cover: no
  // card until the pointer has left the reference.
  const clicked = useRef(false);
  const { shipments, isLoading, isError } = useMasterJobShipments(masterJobId, open);

  const content = (
    // As wide as its content, between 280 and 480px.
    <div className="w-max min-w-[280px] max-w-[480px]">
      <div className="flex items-baseline justify-between gap-4">
        <span className={`${REF} text-[13px] font-bold text-slate-900`}>{mczNumber}</span>
        {!isLoading && !isError && (
          <span className={HINT}>
            {shipments.length} shipment{shipments.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center px-6 py-3">
          <Spin size="small" />
        </div>
      ) : isError ? (
        <div className="mt-2 text-[12px] text-red-600">The shipments could not be loaded.</div>
      ) : (
        <ul className="m-0 mt-2.5 flex max-h-[280px] list-none flex-col gap-1.5 overflow-y-auto border-t border-slate-100 p-0 pt-2.5 text-xs">
          {shipments.map((s) => (
            <li key={s.id} className="flex items-baseline gap-3">
              <Link href={`/shipments/${s.id}`} className={`${REF} ${LINK} shrink-0 font-medium`}>
                {s.jobNumber}
              </Link>
              <span className="min-w-0 truncate text-slate-500">{s.customer}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <HoverCard content={content} delay={HOVER_DELAY_S} flipNearTop open={open} onOpenChange={(next) => setOpen(next && !clicked.current)}>
      <span
        onClickCapture={() => {
          clicked.current = true;
          setOpen(false);
        }}
        onMouseLeave={() => {
          clicked.current = false;
        }}
      >
        {children}
      </span>
    </HoverCard>
  );
}
