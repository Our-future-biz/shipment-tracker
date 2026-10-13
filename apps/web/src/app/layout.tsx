import type { Metadata } from "next";
import "@/styles/globals.css";
import { Providers } from "./Providers";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  // A page that names itself (`metadata.title`) shows as "Quotes | Shipment Tracker" on its
  // browser tab, so several tabs of the app can be told apart.
  title: { default: "Shipment Tracker", template: "%s | Shipment Tracker" },
  description: "Shipment management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
