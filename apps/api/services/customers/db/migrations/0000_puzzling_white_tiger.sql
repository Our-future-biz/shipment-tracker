CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'Operations' NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"ico" text NOT NULL,
	"dic" text DEFAULT '' NOT NULL,
	"company_name" text NOT NULL,
	"legal_form" text DEFAULT '' NOT NULL,
	"registered_address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'CZ' NOT NULL,
	"company_status" text DEFAULT '' NOT NULL,
	"registration_date" text DEFAULT '' NOT NULL,
	"nace" text DEFAULT '' NOT NULL,
	"data_source" text DEFAULT 'ARES' NOT NULL,
	"last_registry_update" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Prospect' NOT NULL,
	"sales_owner" text DEFAULT '' NOT NULL,
	"label" text DEFAULT 'STANDARD' NOT NULL,
	"credit_limit" real DEFAULT 0 NOT NULL,
	"payment_terms" text DEFAULT '' NOT NULL,
	"freight_payment_terms" text DEFAULT '' NOT NULL,
	"duty_payment_terms" text DEFAULT '' NOT NULL,
	"company_website" text DEFAULT '' NOT NULL,
	"logo_data" text DEFAULT '' NOT NULL,
	"logo_source" text DEFAULT '' NOT NULL,
	"logo_updated_at" text DEFAULT '' NOT NULL,
	"total_revenue" real DEFAULT 0 NOT NULL,
	"total_profit" real DEFAULT 0 NOT NULL,
	"total_shipments" integer DEFAULT 0 NOT NULL,
	"last_activity_date" text DEFAULT '' NOT NULL,
	CONSTRAINT "customer_ico_unique" UNIQUE("ico")
);
--> statement-breakpoint
CREATE TABLE "customer_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Other' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"file_type" text DEFAULT '' NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"file_data" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"customer_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Open' NOT NULL,
	"issued_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"customer_id" uuid NOT NULL,
	"type" text DEFAULT 'Note' NOT NULL,
	"content" text NOT NULL,
	"author" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_document" ADD CONSTRAINT "customer_document_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_created_at_idx" ON "contact" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_deleted_at_idx" ON "contact" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "contact_customer_id_idx" ON "contact" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_created_at_idx" ON "customer" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_deleted_at_idx" ON "customer" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customer_ico_idx" ON "customer" USING btree ("ico");--> statement-breakpoint
CREATE INDEX "customer_status_idx" ON "customer" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_document_created_at_idx" ON "customer_document" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_document_deleted_at_idx" ON "customer_document" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customer_document_customer_id_idx" ON "customer_document" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_invoice_created_at_idx" ON "customer_invoice" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_invoice_deleted_at_idx" ON "customer_invoice" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customer_invoice_customer_id_idx" ON "customer_invoice" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_note_created_at_idx" ON "customer_note" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_note_deleted_at_idx" ON "customer_note" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customer_note_customer_id_idx" ON "customer_note" USING btree ("customer_id");