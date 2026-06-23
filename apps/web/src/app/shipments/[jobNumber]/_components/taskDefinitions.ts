export interface TaskDef {
  key: string;
  label: string;
  description: string;
  /** Stage index (0-5) this task contributes to in the top progress bar. */
  stage: number;
}

// Stage bar: 0 Booking confirmed · 1 Cargo ready · 2 In transit · 3 Arrive at POD · 4 Customs clearance · 5 Delivered

export const IMPORT_TASKS: TaskDef[] = [
  { key: "imp_booking_to_agent", label: "Booking to agent", description: "Booking sent to agent", stage: 0 },
  { key: "imp_booking_confirmed", label: "Booking confirmed", description: "Booking has been confirmed", stage: 0 },
  { key: "imp_cargo_readiness", label: "Cargo readiness confirmed", description: "Cargo readiness confirmed with shipper", stage: 1 },
  { key: "imp_cargo_shipped", label: "Cargo shipped", description: "Cargo has been shipped", stage: 2 },
  { key: "imp_pre_alert", label: "Pre-Alert received", description: "Pre-alert received from agent", stage: 2 },
  { key: "imp_arrival_notice", label: "Arrival notice sent", description: "Arrival notice sent to consignee", stage: 3 },
  { key: "imp_paperwork_received", label: "Paperwork received", description: "Paperwork received from agent", stage: 3 },
  { key: "imp_paperwork_customs", label: "Paperwork provided to customs", description: "Paperwork provided to customs", stage: 4 },
  { key: "imp_cargo_released", label: "Cargo released for further transport", description: "Cargo released for further transport", stage: 4 },
  { key: "imp_booked_transport", label: "Booked for further transport", description: "Booked for further transport", stage: 4 },
  { key: "imp_departed_port", label: "Cargo departed from port", description: "Cargo departed from port", stage: 2 },
  { key: "imp_arrived_hub", label: "Cargo arrived to HUB", description: "Cargo arrived to HUB", stage: 3 },
  { key: "imp_customs_cleared", label: "Cargo customs cleared", description: "Cargo customs cleared", stage: 4 },
  { key: "imp_delivered", label: "Delivered", description: "Shipment delivered to final destination", stage: 5 },
  { key: "imp_billed", label: "Billed", description: "Shipment has been billed", stage: 5 },
];

export const EXPORT_TASKS: TaskDef[] = [
  { key: "exp_cargo_readiness", label: "Cargo readiness checked with customer", description: "Cargo readiness checked with customer", stage: 1 },
  { key: "exp_booked_line", label: "Booked with shipping line", description: "Booked with shipping line", stage: 0 },
  { key: "exp_booking_received", label: "Booking received", description: "Booking received from shipping line", stage: 0 },
  { key: "exp_pre_carriage", label: "Pre-carriage booked", description: "Pre-carriage transport booked", stage: 1 },
  { key: "exp_paperwork_customer", label: "Paperwork received from customer", description: "Paperwork received from customer", stage: 1 },
  { key: "exp_draft_sent", label: "Draft sent to customer", description: "Bill of Lading draft sent to customer", stage: 2 },
  { key: "exp_vgm_filed", label: "VGM filed", description: "VGM filed", stage: 2 },
  { key: "exp_si_filed", label: "Shipping Instructions filed", description: "Shipping Instructions filed", stage: 2 },
  { key: "exp_ams_filed", label: "AMS filed (only for US related cargo)", description: "AMS filed for US related cargo", stage: 2 },
  { key: "exp_zapp_issued", label: "Zapp issued", description: "Zapp issued", stage: 3 },
  { key: "exp_zapp_released", label: "Zapp released", description: "Zapp released", stage: 4 },
  { key: "exp_billed", label: "Billed", description: "Shipment has been billed", stage: 5 },
  { key: "exp_bl_provided", label: "Bill Of Lading provided to customer", description: "Bill of Lading provided to customer", stage: 5 },
];

export function getTasksForDirection(tradeDirection?: string | null): TaskDef[] {
  return tradeDirection === "Export" ? EXPORT_TASKS : IMPORT_TASKS;
}

/** Active stage = the furthest stage reached by any completed task (0 if none). */
export function getActiveStageFromTasks(
  taskList: TaskDef[],
  isCompleted: (taskKey: string) => boolean,
): number {
  let active = 0;
  for (const t of taskList) {
    if (isCompleted(t.key) && t.stage > active) active = t.stage;
  }
  return active;
}
