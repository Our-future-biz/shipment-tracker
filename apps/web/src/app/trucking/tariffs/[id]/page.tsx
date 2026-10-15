"use client";

import { useParams } from "next/navigation";
import { TariffView } from "../_components/TariffView";

export default function TariffPage() {
  const { id } = useParams<{ id: string }>();
  return <TariffView tariffId={id} />;
}
