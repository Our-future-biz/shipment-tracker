import type { Metadata } from "next";
import type { ReactNode } from "react";

// The haulier's pages (the transport-order link, the portal, its set-password link): no search
// engine lists them, and a token in the address stays out of what the browser tells any site
// opened from here.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function HaulierLayout({ children }: { children: ReactNode }) {
  return children;
}
