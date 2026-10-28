"use client";

import { useParams } from "next/navigation";
import { RailVersionView } from "../../../_components/RailVersionView";

export default function RailTariffVersionPage() {
  const { customerId, versionId } = useParams<{ customerId: string; versionId: string }>();
  return <RailVersionView customerId={customerId} versionId={versionId} />;
}
