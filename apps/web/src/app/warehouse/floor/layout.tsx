"use client";

import type { ReactNode } from "react";
import { FloorShell } from "./_components/FloorShell";

// Floor mode (phones and handheld scanners): one full-screen frame for its screens. The queue
// (FloorQueueProvider) sits in the Warehouse layout, so it keeps sending on every Warehouse page.
export default function FloorLayout({ children }: { children: ReactNode }) {
  return <FloorShell>{children}</FloorShell>;
}
