-- Issued tax documents are immutable (§29/§35 ZDPH archiving): the legal content of an
-- invoice and its lines can never be changed or deleted. Corrections go through a credit
-- note. Only these may change on an invoice: status issued -> credited, and the stored
-- PDF (pdf_key, pdf_sha256), plus updated_at.
CREATE OR REPLACE FUNCTION invoice_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued invoice % cannot be deleted - issue a credit note instead', OLD.number;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'pdf_key' - 'pdf_sha256' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'pdf_key' - 'pdf_sha256' - 'updated_at') THEN
    RAISE EXCEPTION 'Issued invoice % cannot be changed - issue a credit note instead', OLD.number;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'issued' AND NEW.status = 'credited') THEN
    RAISE EXCEPTION 'Invoice % cannot change status from % to %', OLD.number, OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER invoice_guard BEFORE UPDATE OR DELETE ON "invoice"
  FOR EACH ROW EXECUTE FUNCTION invoice_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invoice_line_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Lines of an issued invoice cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER invoice_line_guard BEFORE UPDATE OR DELETE ON "invoice_line"
  FOR EACH ROW EXECUTE FUNCTION invoice_line_guard();
