-- Customer notices: two more kinds, told from a Co-Loading sailing for several shipments at once -
-- "sailed" and "rolled" (to a later sailing). Council Outlay 14, C6.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "shipment_customer_notice" DROP CONSTRAINT IF EXISTS "shipment_customer_notice_kind_check";--> statement-breakpoint
ALTER TABLE "shipment_customer_notice" ADD CONSTRAINT "shipment_customer_notice_kind_check" CHECK ("shipment_customer_notice"."kind" IN ('status', 'arrival_notice', 'eta_change', 'delivery_advice', 'pod_sent', 'draft_sent', 'bl_provided', 'sailed', 'rolled'));
