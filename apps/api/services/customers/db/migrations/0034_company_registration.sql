CREATE TABLE "company_approval_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_approval_participant" (
	"company_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member" boolean DEFAULT false NOT NULL,
	"added_by_user_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "company_approval_participant_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "company_registration_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"roles" text[] NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_registration_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"terms_name" text DEFAULT '' NOT NULL,
	"terms_url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"customer_id" uuid,
	"already_in_database" boolean DEFAULT false NOT NULL,
	"company_name" text NOT NULL,
	"ico" text DEFAULT '' NOT NULL,
	"dic" text DEFAULT '' NOT NULL,
	"registered_address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"data_source" text DEFAULT '' NOT NULL,
	"roles" text[] NOT NULL,
	"contact_first_name" text NOT NULL,
	"contact_last_name" text NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"contact_role" text,
	"terms_name" text NOT NULL,
	"terms_url" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"requested_by" text DEFAULT '' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"comment" text DEFAULT '' NOT NULL,
	"answer_seen_at" timestamp with time zone,
	CONSTRAINT "company_registration_status_check" CHECK ("company_registration"."status" IN ('pending', 'approved', 'declined'))
);
--> statement-breakpoint
CREATE INDEX "company_approval_message_thread_idx" ON "company_approval_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "company_approval_message_company_idx" ON "company_approval_message" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "company_approval_participant_user_idx" ON "company_approval_participant" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_registration_link_token_idx" ON "company_registration_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "company_registration_link_company_idx" ON "company_registration_link" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "company_registration_company_idx" ON "company_registration" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "company_registration_customer_idx" ON "company_registration" USING btree ("customer_id");