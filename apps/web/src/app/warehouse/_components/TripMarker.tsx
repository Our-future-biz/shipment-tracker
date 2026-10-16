import Link from "next/link";
import { tripHref, tripLabel } from "@/lib/tripSource";

// "From trip LCZ…" next to data a Trucking trip filled (a transport leg, a pick-up row, the gate
// figures). A link to the trip when its id is known — it is changed there, not here.
export function TripMarker({ x, className = "" }: { x: { source?: unknown } | null | undefined; className?: string }) {
  const label = tripLabel(x);
  if (!label) return null;
  const href = tripHref(x);
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
