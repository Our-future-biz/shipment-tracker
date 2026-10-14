ALTER TABLE "invoice" ADD CONSTRAINT "invoice_corrects_invoice_id_fk" FOREIGN KEY ("corrects_invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_corrects_invoice_id_idx" ON "invoice" USING btree ("corrects_invoice_id");--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_vat_code_check" CHECK ("invoice_line"."vat_code" IN ('S21', 'Z69', 'RC', 'OUT', 'NP'));--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_credit_note_link_check" CHECK (("invoice"."kind" = 'credit_note') = ("invoice"."corrects_invoice_id" IS NOT NULL));--> statement-breakpoint
-- A selling row's VAT code is one a line can be set to, or none (default by trade direction).
UPDATE "invoice_selling_cost" SET "vat_code" = NULL WHERE "vat_code" IS NOT NULL AND "vat_code" NOT IN ('S21', 'Z69', 'RC', 'OUT');--> statement-breakpoint
ALTER TABLE "invoice_selling_cost" ADD CONSTRAINT "invoice_selling_cost_vat_code_check" CHECK ("invoice_selling_cost"."vat_code" IN ('S21', 'Z69', 'RC', 'OUT'));