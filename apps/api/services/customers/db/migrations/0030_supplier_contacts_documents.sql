-- A supplier's people and papers: four more contact functions (dispatch, claims, pricing, accounts payable), four
-- more document types (carrier liability insurance, transport licence, framework agreement, certificate) and the
-- day a document is valid to. The checks only widen: every stored value stays allowed. Safe to run again.
ALTER TABLE "contact" DROP CONSTRAINT IF EXISTS "contact_role_check";--> statement-breakpoint
ALTER TABLE "customer_document" DROP CONSTRAINT IF EXISTS "customer_document_type_check";--> statement-breakpoint
ALTER TABLE "customer_document" ADD COLUMN IF NOT EXISTS "valid_to" date;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_role_check" CHECK ("contact"."role" IN ('Purchasing / Procurement', 'Customer Service', 'Logistics Manager', 'Warehouse', 'Finance / Accounting', 'Sales', 'Management', 'Owner', 'Dispatch / Operations', 'Claims', 'Pricing / Tariffs', 'Accounts payable'));--> statement-breakpoint
ALTER TABLE "customer_document" ADD CONSTRAINT "customer_document_type_check" CHECK ("customer_document"."type" IN ('Contract', 'NDA', 'Power of attorney', 'Customs', 'Other', 'Carrier liability insurance', 'Transport licence', 'Framework agreement', 'Certificate'));
