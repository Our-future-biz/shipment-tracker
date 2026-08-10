CREATE INDEX "customer_invoice_status_idx" ON "customer_invoice" USING btree ("status");--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_role_check" CHECK ("contact"."role" IN ('Sales', 'Operations', 'Finance'));--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_status_check" CHECK ("customer"."status" IN ('Active', 'Prospect', 'Inactive'));--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_label_check" CHECK ("customer"."label" IN ('KEY ACCOUNT', 'STANDARD', 'TARGET CUSTOMER', 'PROSPECT', 'RISK'));--> statement-breakpoint
ALTER TABLE "customer_document" ADD CONSTRAINT "customer_document_type_check" CHECK ("customer_document"."type" IN ('Contract', 'NDA', 'Power of attorney', 'Customs', 'Other'));--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_status_check" CHECK ("customer_invoice"."status" IN ('Open', 'Overdue', 'Paid'));--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_type_check" CHECK ("customer_note"."type" IN ('Note', 'Email', 'Call', 'Follow-up', 'Visit'));