"use client";

import { PortalLoginForm } from "../../_components/PortalLoginForm";

// Sign-in of the haulier portal: its own users, never the app's login (AppShell OPEN_PATHS).
export default function HaulierPortalLoginPage() {
  return <PortalLoginForm />;
}
