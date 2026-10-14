"use client";

import { useParams } from "next/navigation";
import { FloorPosition } from "../_components/FloorPosition";

export default function FloorPositionPage() {
  const { id } = useParams<{ id: string }>();
  return <FloorPosition id={id} />;
}
