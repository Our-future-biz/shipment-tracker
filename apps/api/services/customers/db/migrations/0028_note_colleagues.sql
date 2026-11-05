-- The colleagues who went on a visit (a communication entry of type Visit) with its author, by e-mail.
ALTER TABLE "customer_note" ADD COLUMN IF NOT EXISTS "colleagues" text[] DEFAULT '{}'::text[] NOT NULL;
