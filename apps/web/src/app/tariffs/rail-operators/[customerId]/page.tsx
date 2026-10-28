"use client";

import { useParams } from "next/navigation";
import { RailOperatorView } from "../_components/RailOperatorView";

export default function RailOperatorPage() {
  const { customerId } = useParams<{ customerId: string }>();
  return <RailOperatorView customerId={customerId} />;
}
