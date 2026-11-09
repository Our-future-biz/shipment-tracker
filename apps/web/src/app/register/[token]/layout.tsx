import type { Metadata } from "next";
import type { ReactNode } from "react";

// A link meant for one company: no search engine lists it, and the token stays out of what the browser
// tells any site opened from here (the terms open on another site).
export const metadata: Metadata = {
  title: { absolute: "Company registration" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
