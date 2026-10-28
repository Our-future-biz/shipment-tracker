"use client";

import { useParams } from "next/navigation";
import { ShippingLineView } from "../_components/ShippingLineView";

export default function ShippingLinePage() {
  const { customerId } = useParams<{ customerId: string }>();
  return <ShippingLineView customerId={customerId} />;
}
