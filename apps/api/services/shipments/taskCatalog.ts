/**
 * Workflow task keys per trade direction.
 *
 * The frontend owns the labels and descriptions in
 * `apps/web/src/app/shipments/[jobNumber]/_components/taskDefinitions.ts`;
 * the backend only needs the keys, to know how many tasks a shipment is
 * expected to complete. `tests/taskCatalog.test.ts` fails if the two drift.
 *
 * Why counts rather than a "has an incomplete task" check: a shipment_task row
 * is only written when someone ticks a task, and ticking is write-once (see
 * shipmentTask.repository.upsert). A row with completed = false is therefore
 * never created, so "outstanding work" has to be derived from how many of the
 * expected tasks have been ticked.
 */

export const IMPORT_TASK_KEYS = [
  "imp_booking_to_agent",
  "imp_booking_confirmed",
  "imp_cargo_readiness",
  "imp_cargo_shipped",
  "imp_pre_alert",
  "imp_arrival_notice",
  "imp_paperwork_received",
  "imp_paperwork_customs",
  "imp_cargo_released",
  "imp_booked_transport",
  "imp_departed_port",
  "imp_arrived_hub",
  "imp_customs_cleared",
  "imp_delivered",
  "imp_billed",
] as const;

export const EXPORT_TASK_KEYS = [
  "exp_cargo_readiness",
  "exp_booked_line",
  "exp_booking_received",
  "exp_pre_carriage",
  "exp_paperwork_customer",
  "exp_draft_sent",
  "exp_vgm_filed",
  "exp_si_filed",
  "exp_ams_filed",
  "exp_zapp_issued",
  "exp_zapp_released",
  "exp_billed",
  "exp_bl_provided",
] as const;

export const IMPORT_TASK_COUNT = IMPORT_TASK_KEYS.length;
export const EXPORT_TASK_COUNT = EXPORT_TASK_KEYS.length;
