"use client";

import { useParams } from "next/navigation";
import { OceanVersionView } from "../../../_components/OceanVersionView";

export default function OceanTariffVersionPage() {
  const { customerId, versionId } = useParams<{ customerId: string; versionId: string }>();
  return <OceanVersionView customerId={customerId} versionId={versionId} />;
}
