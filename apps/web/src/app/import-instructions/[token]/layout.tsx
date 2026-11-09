import type { Metadata } from "next";
import type { ReactNode } from "react";

// A link meant for one customer: no search engine lists it, and the token stays out of what the
// browser tells any site opened from here.
export const metadata: Metadata = {
  title: { absolute: "Import Instructions" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ImportInstructionsLayout({ children }: { children: ReactNode }) {
  return children;
}
