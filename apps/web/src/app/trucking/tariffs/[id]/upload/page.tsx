"use client";

import { useParams } from "next/navigation";
import { TariffUploadWizard } from "../../_components/TariffUploadWizard";

export default function TariffUploadPage() {
  const { id } = useParams<{ id: string }>();
  return <TariffUploadWizard tariffId={id} />;
}
