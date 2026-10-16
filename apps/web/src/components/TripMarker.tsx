"use client";

import Link from "next/link";
import { useCanSeeConcepts } from "@/lib/auth/AuthContext";
import { tripHref, tripLabel } from "@/lib/tripSource";

interface TripMarkerProps {
  x: { source?: unknown } | null | undefined;
  className?: string;
}

// "From trip LCZ…" next to data a Trucking trip filled (a transport leg, a pick-up row, the gate
// figures). A link to the trip when its id is known and the company has Trucking — it is changed
// there, not here.
export function TripMarker({ x, className = "" }: TripMarkerProps) {
  const canSeeConcepts = useCanSeeConcepts();
  const label = tripLabel(x);
  if (!label) return null;
  const href = canSeeConcepts ? tripHref(x) : null;
  const cls = `whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ${className}`;
  return href ? (
    <Link href={href} className={`${cls} hover:underline`} title="Planned in Trucking — open the trip to change it">
      {label}
    </Link>
  ) : (
    <span className={cls} title="Planned in Trucking — change it on the trip">
      {label}
    </span>
  );
}
