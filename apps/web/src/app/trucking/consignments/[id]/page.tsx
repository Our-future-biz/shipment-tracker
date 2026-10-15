"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ConsignmentView } from "../_components/ConsignmentView";

export default function ConsignmentPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <ConsignmentView consignmentId={id} />
    </Suspense>
  );
}
