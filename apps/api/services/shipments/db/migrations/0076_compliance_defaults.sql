-- The Compliance card's starting states (lib/fieldDefaults startingStateDefaults, Martin 2026-11-10)
-- for shipments made before them: only a blank field is filled, so a state someone set stays.
UPDATE "shipment" SET "shipping_instructions" = 'Not Queried' WHERE btrim("shipping_instructions") = '';--> statement-breakpoint
UPDATE "shipment" SET "insurance" = 'No' WHERE btrim("insurance") = '';--> statement-breakpoint
UPDATE "shipment" SET "ams" = 'Not Applicable' WHERE btrim("ams") = '';--> statement-breakpoint
UPDATE "shipment" SET "isf" = 'Not Applicable' WHERE btrim("isf") = '';--> statement-breakpoint
UPDATE "shipment" SET "bol_draft" = 'Not Processed' WHERE btrim("bol_draft") = '';--> statement-breakpoint
UPDATE "shipment" SET "vgm" = 'Pending (Red)' WHERE btrim("vgm") = '';--> statement-breakpoint
UPDATE "shipment" SET "booking_confirmation" = 'Pending' WHERE btrim("booking_confirmation") = '';
