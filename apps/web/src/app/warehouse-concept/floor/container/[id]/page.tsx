"use client";

import { useParams } from "next/navigation";
import { FloorContainer } from "../../_components/FloorContainer";

export default function FloorContainerPage() {
  const { id } = useParams<{ id: string }>();
  return <FloorContainer id={id} />;
}
