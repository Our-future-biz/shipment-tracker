"use client";

import { useParams } from "next/navigation";
import { GateJobView } from "../_components/job/GateJobView";

export default function GateMovementPage() {
  const { id } = useParams<{ id: string }>();
  return <GateJobView id={id} />;
}
