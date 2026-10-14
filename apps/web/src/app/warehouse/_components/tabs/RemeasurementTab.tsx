"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useWarehouse } from "@/hooks/useWarehouse";
import { useGateLog, useGateMovement } from "@/hooks/useGateLog";
import { usePositionSection, type SentWhat } from "@/hooks/useWarehouseSection";
import type { interfaces } from "@/lib/api/client";
import { WarehouseTab } from "@/app/shipments/[jobNumber]/tabs/WarehouseTab";
import { sectionSaveError } from "@/app/shipments/[jobNumber]/tabs/warehouse/JobExtras";
import { errorMessage } from "../../gate-log/_lib/gate";
import { linesTotals, parseLines } from "../../_lib/cargoCompare";
import { useUnsavedGuard } from "../../_lib/useUnsavedGuard";
import { HeaderStrip } from "../remeasurement/HeaderStrip";
import { CargoComparison } from "../remeasurement/CargoComparison";
import { RemeasureLines } from "../remeasurement/RemeasureLines";
import { SaveBar } from "../remeasurement/SaveBar";
import { MarkSentModal, NotesAndSent, SENT_LABEL } from "../remeasurement/NotesAndSent";
import { ExceptionsBlock } from "../remeasurement/ExceptionsBlock";
import { ReleaseReadiness } from "../remeasurement/ReleaseReadiness";
import { Worklist } from "../remeasurement/Worklist";
import { useJobDraft } from "../remeasurement/useJobDraft";

// Remeasurement / Release: the warehouse's work on one POSITION — linked to a shipment or
// stand-alone. Opened from the Job no. in Positions (?position=<task id>), from "Shipment Details"
// on the gate job, or from "Edit in Warehouse" in Shipments (?shipment=<shipment id>, resolved to
// the shipment's position). With nothing open it lists what waits for remeasurement or release.
export function RemeasurementTab({ shipmentId, positionId, onBack }: { shipmentId: string | null; positionId: string | null; onBack: () => void }) {
  if (!shipmentId && !positionId) return <Worklist />;
  return <Resolve shipmentId={shipmentId} positionId={positionId} onBack={onBack} />;
}

function Resolve({ shipmentId, positionId, onBack }: { shipmentId: string | null; positionId: string | null; onBack: () => void }) {
  const { tasks, isLoading } = useWarehouse();
  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  const task = positionId ? tasks.find((t) => t.id === positionId || t.taskId === positionId) : tasks.find((t) => t.shipmentId === shipmentId);
  if (task) return <PositionPart key={task.id} task={task} onBack={onBack} />;
  // A shipment with no warehouse position keeps its own Shipment Details, as before.
  if (shipmentId) return <ShipmentOnlyPart shipmentId={shipmentId} onBack={onBack} />;
  return (
    <div className="flex items-center gap-2 text-slate-500">
      <BackButton onBack={onBack} /> Warehouse position not found — it may have been removed.
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} aria-label="Back to the worklist" className="text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1">
      <ArrowLeftOutlined />
    </button>
  );
}

function PositionPart({ task, onBack }: { task: interfaces.WarehouseTaskItem; onBack: () => void }) {
  const toast = useToast();
  const { movements, isLoading: movementsLoading } = useGateLog();
  const listed = movements.find((mv) => mv.warehouseTaskId === task.id);
  const { movement: detail, applyRemeasured } = useGateMovement(listed?.id);
  const m = detail ?? listed;

  const { data: shipmentData } = useQuery({
    queryKey: ["warehouse-shipment", task.shipmentId],
    queryFn: () => api.shipments.shipmentGet(task.shipmentId!),
    enabled: !!task.shipmentId,
  });
  const shipment = shipmentData?.shipment ?? null;

  const section = usePositionSection(task.id, "job");
  const draft = useJobDraft(section.data);
  useUnsavedGuard(draft.count > 0);
  const [markWhat, setMarkWhat] = useState<SentWhat | null>(null);

  const saved = linesTotals(parseLines(section.data.remeasure_rows));
  const savedRemeasured = saved.pieces || saved.kg || saved.cbm ? saved : null;

  const blocked =
    draft.invalidLines > 0
      ? "Some lines have a value that is not a number — re-enter it first"
      : draft.notesConflict || draft.linesConflict
        ? "Someone else saved meanwhile — choose which version to keep first"
        : null;

  const save = async () => {
    const changes = draft.changes();
    if (!changes.length) return;
    try {
      await section.saveKeys(changes);
      draft.saved(changes);
      toast.success("Saved");
    } catch (e) {
      toast.error(sectionSaveError(e));
    }
  };

  const mark = (what: SentWhat, note: string) =>
    section
      .markSent({ what, note })
      .then(() => toast.success(what === "inform_operations" ? "Operations informed — logged" : `${SENT_LABEL[what]} marked as sent — logged`))
      .catch((e) => {
        toast.error(errorMessage(e, "Failed to record it"));
        throw e;
      });

  if (section.isLoading || movementsLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HeaderStrip task={task} m={m} shipment={shipment} remeasured={savedRemeasured} onBack={onBack} />
      {section.isError && <Alert type="error" showIcon message="The Shipment Details of this position could not be read — reload the page." />}
      {!m && <Alert type="info" showIcon message="This position has no gate record yet — the gate figures, exceptions and release show once it has one." />}

      <CargoComparison
        m={m}
        shipment={shipment}
        rows={draft.rows}
        linesUnsaved={draft.linesChanged}
        data={section.data}
        sectionVersion={section.version}
        informing={section.isMarking}
        onInform={() => setMarkWhat("inform_operations")}
        onMarkRemeasurementSent={() => setMarkWhat("remeasurement")}
        applying={applyRemeasured.isPending}
        applyRemeasured={(version) =>
          applyRemeasured
            .mutateAsync(version)
            .then(() => toast.success("Gate figures set from the remeasurement — logged on the gate record"))
            .catch((e) => {
              toast.error(errorMessage(e, "Failed to use the remeasured figures"));
              throw e;
            })
        }
      />

      <RemeasureLines draft={draft} />
      <NotesAndSent draft={draft} data={section.data} onMark={setMarkWhat} m={m} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <ExceptionsBlock m={m} />
        <ReleaseReadiness m={m} />
      </div>

      <SaveBar count={draft.count} saving={section.isSaving} blocked={blocked} onSave={save} onDiscard={draft.discard} />
      <MarkSentModal what={markWhat} saving={section.isMarking} onClose={() => setMarkWhat(null)} onSubmit={mark} m={m} />
    </div>
  );
}

// A shipment that is not (or no longer) a warehouse position: its own Shipment Details, kept on
// the shipment as before positions owned them.
function ShipmentOnlyPart({ shipmentId, onBack }: { shipmentId: string; onBack: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["warehouse-shipment", shipmentId],
    queryFn: () => api.shipments.shipmentGet(shipmentId),
  });
  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <BackButton onBack={onBack} /> Shipment not found.
      </div>
    );
  }
  const shipment = data.shipment;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton onBack={onBack} />
        <h2 className="text-[20px] font-bold text-slate-800 m-0 font-mono">{shipment.jobNumber}</h2>
        {shipment.customer && <span className="ml-2 text-sm text-slate-500">{shipment.customer}</span>}
      </div>
      <Alert
        type="info"
        showIcon
        message={
          <span className="text-xs">
            This shipment is not a warehouse position. Import it in{" "}
            <Link href="/warehouse" className="text-indigo-500">
              Positions → Create new
            </Link>{" "}
            to get the gate figures, exceptions and release here.
          </span>
        }
      />
      <WarehouseTab shipment={shipment} />
    </div>
  );
}
