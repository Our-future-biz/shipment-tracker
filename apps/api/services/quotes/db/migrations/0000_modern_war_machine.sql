CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"quote_number" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	CONSTRAINT "quote_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "quote_ref_sequence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"quote_number" text NOT NULL,
	"next_sub_line" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "quote_created_at_idx" ON "quote" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "quote_deleted_at_idx" ON "quote" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "quote_quote_number_idx" ON "quote" USING btree ("quote_number");--> statement-breakpoint
CREATE INDEX "quote_ref_sequence_created_at_idx" ON "quote_ref_sequence" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "quote_ref_sequence_deleted_at_idx" ON "quote_ref_sequence" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "quote_ref_sequence_quote_number_idx" ON "quote_ref_sequence" USING btree ("quote_number");