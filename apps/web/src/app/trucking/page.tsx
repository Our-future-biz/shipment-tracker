"use client";

import { Suspense } from "react";
import { TruckingView } from "./_components/TruckingView";

export default function TruckingPage() {
  return (
    <Suspense fallback={null}>
      <TruckingView />
    </Suspense>
  );
}
