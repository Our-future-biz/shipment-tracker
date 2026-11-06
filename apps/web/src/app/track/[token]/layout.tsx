import type { Metadata } from "next";
import type { ReactNode } from "react";

// A link meant for one customer: no search engine lists it, and the token stays out of what the
// browser tells any site opened from here.
export const metadata: Metadata = {
  // Absolute: the customer sees no app name the root layout's template would add.
  title: { absolute: "Shipment status" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function TrackLayout({ children }: { children: ReactNode }) {
  return children;
}
