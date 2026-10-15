"use client";

import { useParams } from "next/navigation";
import { HaulierView } from "../_components/HaulierView";

export default function HaulierPage() {
  const { customerId } = useParams<{ customerId: string }>();
  return <HaulierView customerId={customerId} />;
}
