ALTER TABLE "warehouse_gate_movement" ADD COLUMN "job_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "pol" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "pod" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "etd" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "eta" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "vessel" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "voyage" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "container_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "seal_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "booking_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "hbl_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "mbl_number" text DEFAULT '' NOT NULL;