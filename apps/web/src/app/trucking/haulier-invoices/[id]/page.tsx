"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { HaulierInvoiceView } from "../_components/HaulierInvoiceView";

export default function HaulierInvoicePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <HaulierInvoiceView invoiceId={id} />
    </Suspense>
  );
}
