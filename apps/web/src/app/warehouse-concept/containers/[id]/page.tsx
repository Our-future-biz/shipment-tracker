"use client";

import { useParams } from "next/navigation";
import { ContainerDetail } from "../../_components/container/ContainerDetail";

export default function WarehouseContainerPage() {
  const { id } = useParams<{ id: string }>();
  return <ContainerDetail id={id} />;
}
