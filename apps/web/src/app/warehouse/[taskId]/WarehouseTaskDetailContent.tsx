"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Spin } from "antd";
import { useGateLog } from "@/hooks/useGateLog";

// A position has one page: its Gate Log job. This old address (/warehouse/<taskId>) forwards
// there, so existing links keep working; a position without a gate movement gets a short note.
export function WarehouseTaskDetailContent() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const { movements, isLoading } = useGateLog();
  const movementId = movements.find((x) => x.warehouseTaskId === taskId)?.id;

  useEffect(() => {
    if (movementId) router.replace(`/warehouse/gate-log/${movementId}`);
  }, [movementId, router]);

  if (isLoading || movementId) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="p-10 text-center text-slate-500">
      This position has no Gate Log job yet.{" "}
      <Link href="/warehouse" className="text-indigo-500">
        Back to Warehouse
      </Link>
    </div>
  );
}
