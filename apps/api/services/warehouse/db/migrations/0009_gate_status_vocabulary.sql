-- The gate movement status is now Expected | In Warehouse | Released (Refused stays as it is).
UPDATE "warehouse_gate_movement" SET "status" = 'In Warehouse' WHERE "status" IN ('At gate', 'In progress');--> statement-breakpoint
UPDATE "warehouse_gate_movement" SET "status" = 'Released' WHERE "status" = 'Done';--> statement-breakpoint
UPDATE "warehouse_gate_movement" SET "status" = 'Expected' WHERE "status" IN ('No-show', 'No pre-advice');
