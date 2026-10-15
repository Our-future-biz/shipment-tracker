"use client";

import { useParams } from "next/navigation";
import { PortalSetPasswordForm } from "../../../_components/PortalSetPasswordForm";

// The one-time invitation or reset link of a portal user (AppShell OPEN_PATHS).
export default function HaulierPortalSetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  return <PortalSetPasswordForm token={token} />;
}
