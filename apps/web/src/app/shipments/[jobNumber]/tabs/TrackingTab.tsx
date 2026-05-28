"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";

interface TaskState {
  taskKey: string;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
}

const IMPORT_TASKS = [
  { key: "imp_booking_to_agent", label: "Booking to agent" },
  { key: "imp_booking_confirmed", label: "Booking confirmed" },
  { key: "imp_cargo_readiness", label: "Cargo readiness confirmed" },
  { key: "imp_cargo_shipped", label: "Cargo shipped" },
  { key: "imp_pre_alert", label: "Pre-Alert received" },
  { key: "imp_arrival_notice", label: "Arrival notice sent" },
  { key: "imp_paperwork_received", label: "Paperwork received" },
  { key: "imp_paperwork_customs", label: "Paperwork provided to customs" },
  { key: "imp_cargo_released", label: "Cargo released for further transport" },
  { key: "imp_booked_transport", label: "Booked for further transport" },
  { key: "imp_departed_port", label: "Cargo departed from port" },
  { key: "imp_arrived_hub", label: "Cargo arrived to HUB" },
  { key: "imp_customs_cleared", label: "Cargo customs cleared" },
  { key: "imp_delivered", label: "Delivered" },
  { key: "imp_billed", label: "Billed" },
];

const EXPORT_TASKS = [
  { key: "exp_cargo_readiness", label: "Cargo readiness checked with customer" },
  { key: "exp_booked_line", label: "Booked with shipping line" },
  { key: "exp_booking_received", label: "Booking received" },
  { key: "exp_pre_carriage", label: "Pre-carriage booked" },
  { key: "exp_paperwork_customer", label: "Paperwork received from customer" },
  { key: "exp_draft_sent", label: "Draft sent to customer" },
  { key: "exp_vgm_filed", label: "VGM filed" },
  { key: "exp_si_filed", label: "Shipping Instructions filed" },
  { key: "exp_ams_filed", label: "AMS filed (only for US related cargo)" },
  { key: "exp_zapp_issued", label: "Zapp issued" },
  { key: "exp_zapp_released", label: "Zapp released" },
  { key: "exp_billed", label: "Billed" },
  { key: "exp_bl_provided", label: "Bill Of Lading provided to customer" },
];

export function TrackingTab({ shipment }: { shipment: ShipmentItem }) {
  const tradeDirection = shipment.tradeDirection || "Import";
  const taskList = tradeDirection === "Export" ? EXPORT_TASKS : IMPORT_TASKS;

  const tasksQuery = useQuery({
    queryKey: ["shipment-tasks", shipment.id],
    queryFn: () => api.shipments.taskList(shipment.id),
  });

  const tasks: TaskState[] = tasksQuery.data?.tasks ?? [];

  const completedTasks = tasks
    .filter((t) => t.completed && t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (completedTasks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <p className="text-center text-slate-400 text-sm py-8">No tracking events yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="relative pl-6">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-sm" />
        {completedTasks.map((task, i) => {
          const def = taskList.find((t) => t.key === task.taskKey);
          const isLatest = i === 0;
          return (
            <div key={task.taskKey} className="relative mb-4">
              <div
                className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2 ${
                  isLatest
                    ? "border-indigo-500 bg-indigo-500"
                    : "border-slate-300 bg-white"
                }`}
              />
              <div>
                <p className={`text-sm font-medium ${isLatest ? "text-indigo-500" : "text-slate-700"}`}>
                  {def?.label || task.taskKey}
                </p>
                <p className="text-[11px] text-slate-400">
                  {new Date(task.completedAt!).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
