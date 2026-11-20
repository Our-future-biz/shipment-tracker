-- System-21 mock council review of M1 (20 Nov 2026): the owner's rule is that a real cost on a buying line when the
-- customer was billed stays as billed, and only a real cost that arrives after the billing stays open until its
-- supplier invoice is approved or paid. Nothing kept told when a line's real cost arrived: the supplier invoice's
-- record is made later by the Accounts Payable backfill, again when its supplier is relinked, and a number typed after
-- the billing on a line whose amount was there before gives a new record too. So the line keeps it: real_cost_at,
-- the moment its real amount went from none to one. The database stamps it, so every write (typed, read from a
-- document, a master job's split, a refusal that takes the cost off) keeps it right: set when a real amount comes,
-- kept while the line has one, cleared with it. Lines already holding a real cost are left empty - read as "there
-- before the billing", so they stay as billed. Safe to run again.
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "real_cost_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION invoice_cost_real_cost_at() RETURNS trigger AS $$
BEGIN
  IF NEW.real_amount IS NULL THEN
    NEW.real_cost_at := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.real_cost_at := coalesce(NEW.real_cost_at, now());
  ELSIF OLD.real_amount IS NULL THEN
    NEW.real_cost_at := now();
  ELSE
    NEW.real_cost_at := OLD.real_cost_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS invoice_cost_real_cost_at ON "invoice_cost";--> statement-breakpoint
CREATE TRIGGER invoice_cost_real_cost_at BEFORE INSERT OR UPDATE ON "invoice_cost"
  FOR EACH ROW EXECUTE FUNCTION invoice_cost_real_cost_at();
