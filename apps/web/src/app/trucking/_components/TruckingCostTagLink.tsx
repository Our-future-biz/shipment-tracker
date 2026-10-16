import Link from "next/link";
import type { TruckingCostTag } from "../_lib/truckingCosts";

// The tag under a Trucking row in a job's Costs Breakdown: what the row comes from, linking to the
// consignment or trip where it changes (the row itself is read-only there).
export const TruckingCostTagLink = ({ tag }: { tag: TruckingCostTag }) => (
  <Link href={tag.href} title={tag.title} className="block px-[7px] text-[10.5px] font-semibold text-indigo-600 hover:underline">
    {tag.label}
  </Link>
);
