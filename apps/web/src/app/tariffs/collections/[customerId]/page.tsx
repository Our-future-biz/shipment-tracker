"use client";

import { useParams } from "next/navigation";
import { CollectionHaulierView } from "../_components/CollectionHaulierView";

export default function CollectionHaulierPage() {
  const { customerId } = useParams<{ customerId: string }>();
  return <CollectionHaulierView customerId={customerId} />;
}
