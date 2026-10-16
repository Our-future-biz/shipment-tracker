"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Spin } from "antd";
import { useGateLog, useRepairMissingGate } from "@/hooks/useGateLog";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { errorMessage, isManager } from "../gate-log/_lib/gate";

// A position has one page: its Gate Log job. This old address (/warehouse/<taskId>) forwards
// there, so existing links keep working; a position without a gate movement gets a short note.
export function WarehouseTaskDetailContent() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const { movements, isLoading } = useGateLog();
  const movementId = movements.find((x) => x.warehouseTaskId === taskId)?.id;
  const { user } = useAuth();
  const toast = useToast();
  // Manager only: gate records for positions of shipments that have none (from before every
  // import made one), read from their shipments.
  const repair = useRepairMissingGate();
  const runRepair = () =>
    repair.mutate(undefined, {
      onSuccess: (res) => {
        const failed = res.failed.map((f) => `${f.ref}: ${f.reason}`).join(" · ");
        if (res.failed.length)
          toast.notify({
            type: "warning",
            title: `${res.created} made, ${res.failed.length} failed`,
            description: failed,
          });
        else
          toast.success(
            res.created
              ? `${res.created} missing Gate Log job${res.created === 1 ? "" : "s"} made`
              : "No position was missing its Gate Log job",
          );
      },
      onError: (e) => toast.error(errorMessage(e, "Failed to make the missing Gate Log jobs")),
    });

  useEffect(() => {
    if (movementId) router.replace(`/warehouse-concept/gate-log/${movementId}`);
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
      <Link href="/warehouse-concept" className="text-indigo-500">
        Back to Warehouse
      </Link>
      {isManager(user) && (
        <div className="mt-4">
          <Button onClick={runRepair} loading={repair.isPending}>
            Make missing Gate Log jobs from their shipments
          </Button>
        </div>
      )}
    </div>
  );
}
