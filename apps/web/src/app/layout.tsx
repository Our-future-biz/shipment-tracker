import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./Providers";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  // A page that names itself (`metadata.title`) shows as "Quotes | Shipment Tracker" on its
  // browser tab, so several tabs of the app can be told apart.
  title: { default: "Shipment Tracker", template: "%s | Shipment Tracker" },
  description: "Shipment management system",
};

// The app's one typeface, for every letter (latin-ext for Czech names). Served from the app itself,
// so no font is fetched from another site. Tailwind's sans and mono and antd's font all point here.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
