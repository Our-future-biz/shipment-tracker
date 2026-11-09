"use client";

import { useParams } from "next/navigation";
import { RegistrationForm } from "./RegistrationForm";

// A company's link to register itself: outside the sign-in (AppShell OPEN_PATHS).
export default function RegistrationPage() {
  const { token } = useParams<{ token: string }>();
  return <RegistrationForm token={token} />;
}
