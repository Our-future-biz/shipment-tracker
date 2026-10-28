"use client";

import { useParams } from "next/navigation";
import { CollectionVersionView } from "../../../_components/CollectionVersionView";

export default function CollectionTariffVersionPage() {
  const { customerId, versionId } = useParams<{ customerId: string; versionId: string }>();
  return <CollectionVersionView customerId={customerId} versionId={versionId} />;
}
