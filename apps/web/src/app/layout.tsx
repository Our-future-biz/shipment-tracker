import type { Metadata } from "next";
import "@/styles/globals.css";
import { Providers } from "./Providers";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  title: "Shipment Tracker",
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
