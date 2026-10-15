"use client";

import { useParams } from "next/navigation";
import { TariffVersionView } from "../../../_components/TariffVersionView";

export default function TariffVersionPage() {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  return <TariffVersionView tariffId={id} versionId={versionId} />;
}
