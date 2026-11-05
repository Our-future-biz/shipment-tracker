import Link from "next/link";
import type { TruckingCostTag } from "@/lib/truckingCosts";
import { LINK } from "@/styles/ui";

interface TruckingCostTagLinkProps {
  tag: TruckingCostTag;
}

// The tag under a Trucking row in a job's Costs Breakdown: what the row comes from, linking to the
// consignment or trip where it changes (the row itself is read-only there). Plain text when the
// company has Trucking hidden.
export const TruckingCostTagLink = ({ tag }: TruckingCostTagLinkProps) =>
  tag.href ? (
    <Link href={tag.href} title={tag.title} className={`block px-[7px] text-[11px] font-semibold ${LINK}`}>
      {tag.label}
    </Link>
  ) : (
    <span title={tag.title} className="block px-[7px] text-[11px] font-semibold text-slate-500">
      {tag.label}
    </span>
  );
