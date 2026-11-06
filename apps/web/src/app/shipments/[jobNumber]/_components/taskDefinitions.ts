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
  { key: "imp_billed", label: "Billed", description: "Shipment has been billed", stage: 5 },
  { key: "imp_delivered", label: "Delivered", description: "Shipment delivered to final destination", stage: 5 },
  { key: "imp_extra_costs", label: "Extra costs processed", description: "Extra costs processed", stage: 5 },
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

/**
 * The ticks that are also a dated fact: ticking one asks for the date and records the event. The
 * server keeps the same list (lib/trackingEvents TICK_EVENTS); tests/taskCatalog.test fails if they drift.
 */
export const TICK_EVENTS: Readonly<Record<string, string>> = {
  imp_cargo_readiness: "cargo_ready",
  exp_cargo_readiness: "cargo_ready",
  imp_cargo_shipped: "departed",
  imp_departed_port: "terminal_out",
  imp_arrived_hub: "hub_arrived",
  imp_customs_cleared: "customs_released",
  imp_delivered: "delivered",
};

/**
 * The ticks that mean the customer was told: ticking one opens Tell the customer, and the notice
 * writes the tick. The server keeps the same list (lib/customerNotice TICK_NOTICES).
 */
export const TICK_NOTICES: Readonly<Record<string, string>> = {
  imp_arrival_notice: "arrival_notice",
  exp_draft_sent: "draft_sent",
  exp_bl_provided: "bl_provided",
};

/**
 * The ticks the app writes itself, with what writes them. The server refuses them as plain ticks
 * (lib/trackingEvents SELF_TICKS); tests/taskCatalog.test fails if they drift.
 */
export const SELF_TICKS: Readonly<Record<string, string>> = {
  imp_billed: "Billed ticks itself when the job is invoiced",
  exp_billed: "Billed ticks itself when the job is invoiced",
  imp_delivered: "Delivered ticks itself when the delivery date is set",
};

type FreightKind = "sea" | "air" | "rail" | "road";

/** How a job travels. The server decides the same way (lib/trackingEvents freightKindOf). */
export function freightKindOf(tradeDirection?: string | null, freightMode?: string | null): FreightKind {
  const mode = (freightMode ?? "").trim();
  if ((tradeDirection ?? "").trim().toLowerCase() === "domestic" || /road/i.test(mode)) return "road";
  if (/^air/i.test(mode)) return "air";
  if (/^rail/i.test(mode)) return "rail";
  return "sea";
}

/** What a truck's job needs of the checklist: its stamps are set in Trucking. */
const ROAD_TASKS: ReadonlySet<string> = new Set([
  "imp_booking_confirmed",
  "imp_cargo_readiness",
  "imp_booked_transport",
  "imp_delivered",
  "imp_billed",
  "imp_extra_costs",
  "exp_cargo_readiness",
  "exp_booked_line",
  "exp_paperwork_customer",
  "exp_billed",
]);

/** Filings that belong to the sea: a plane needs none of them, a train still takes shipping instructions. */
const NOT_FILED: Partial<Record<FreightKind, ReadonlySet<string>>> = {
  air: new Set(["exp_vgm_filed", "exp_si_filed", "exp_ams_filed"]),
  rail: new Set(["exp_vgm_filed", "exp_ams_filed"]),
};

const TASK_WORDS: Partial<Record<FreightKind, Readonly<Record<string, string>>>> = {
  air: {
    exp_booked_line: "Booked with airline",
    exp_booking_received: "Booking received",
    exp_draft_sent: "Air Waybill draft sent to customer",
    exp_bl_provided: "Air Waybill provided to customer",
    imp_departed_port: "Cargo left the airport",
  },
  rail: {
    exp_booked_line: "Booked with rail operator",
    exp_draft_sent: "Rail waybill draft sent to customer",
    exp_bl_provided: "Rail waybill provided to customer",
    imp_departed_port: "Cargo left the terminal",
  },
  road: { exp_booked_line: "Booked with haulier" },
};

/** The checklist of a job, by its direction and how it travels. Without a mode it is the full list. */
export function getTasksForDirection(tradeDirection?: string | null, freightMode?: string | null): TaskDef[] {
  const tasks = tradeDirection === "Export" ? EXPORT_TASKS : IMPORT_TASKS;
  const kind = freightKindOf(tradeDirection, freightMode);
  const words = TASK_WORDS[kind] ?? {};
  return tasks
    .filter((t) => (kind === "road" ? ROAD_TASKS.has(t.key) : !NOT_FILED[kind]?.has(t.key)))
    .map((t) => (words[t.key] ? { ...t, label: words[t.key]!, description: words[t.key]! } : t));
}

/**
 * Active stage = the furthest stage reached by any completed task (0 if none). Once every task
 * of that stage is done, the stage counts as done and the next one is active; with every task
 * done this returns the number of stages, so all of them show as done.
 */
export function getActiveStageFromTasks(
  taskList: TaskDef[],
  isCompleted: (taskKey: string) => boolean,
): number {
  let active = 0;
  for (const t of taskList) {
    if (isCompleted(t.key) && t.stage > active) active = t.stage;
  }
  const stageTasks = taskList.filter((t) => t.stage === active);
  if (stageTasks.length > 0 && stageTasks.every((t) => isCompleted(t.key))) active += 1;
  return active;
}

/** The customs status that means the cargo is through. */
export const CUSTOMS_CLEARED = "Customs Cleared/Released";

export interface StageFacts {
  tradeDirection?: string | null;
  actualDeparture?: string | null;
  actualArrival?: string | null;
  customsStatus?: string | null;
  actualDeliveryDate?: string | null;
}

/**
 * The stage a shipment's own dates put it at, whatever is ticked: departed = In transit, arrived =
 * past Arrive at POD, cleared = past Customs clearance, delivered = every stage done. An export is
 * cleared before it sails, so its customs status says nothing about the stages.
 */
export function getStageFromFacts(facts: StageFacts): number {
  if (facts.actualDeliveryDate) return 6;
  const isExport = (facts.tradeDirection ?? "").trim().toLowerCase() === "export";
  if (!isExport && facts.customsStatus === CUSTOMS_CLEARED) return 5;
  if (facts.actualArrival) return 4;
  if (facts.actualDeparture) return 2;
  return 0;
}

/** The active stage: the ticks and the dates can each only push it forward, never back. */
export function getActiveStage(taskList: TaskDef[], isCompleted: (taskKey: string) => boolean, facts: StageFacts): number {
  return Math.max(getActiveStageFromTasks(taskList, isCompleted), getStageFromFacts(facts));
}
