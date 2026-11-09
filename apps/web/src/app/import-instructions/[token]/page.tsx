"use client";

import { useParams } from "next/navigation";
import { ImportInstructionsForm } from "./ImportInstructionsForm";

// A customer's link to fill in the Import Instructions: outside the sign-in (AppShell OPEN_PATHS).
export default function ImportInstructionsPage() {
  const { token } = useParams<{ token: string }>();
  return <ImportInstructionsForm token={token} />;
}
