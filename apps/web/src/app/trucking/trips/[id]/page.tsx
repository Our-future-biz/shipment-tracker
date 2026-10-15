"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { TripView } from "../_components/TripView";

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <TripView tripId={id} />
    </Suspense>
  );
}
