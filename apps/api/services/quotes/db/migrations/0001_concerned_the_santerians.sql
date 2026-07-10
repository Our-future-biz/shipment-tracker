CREATE TABLE "quote_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"quote_number" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"file_type" text DEFAULT '' NOT NULL,
	"storage_key" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "quote_attachment_created_at_idx" ON "quote_attachment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "quote_attachment_deleted_at_idx" ON "quote_attachment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "quote_attachment_quote_number_idx" ON "quote_attachment" USING btree ("quote_number");