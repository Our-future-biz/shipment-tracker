-- Doplneni zmen, ktere byly dodatecne dopsany do jiz odbavene migrace 0002.
-- Encore si pamatuje, ze 0002 probehla, takze se pozdejsi upravy toho souboru
-- nikdy nespustily. Vysledkem bylo, ze neslo pridat buying ani selling cost.
-- Vse je psano idempotentne, aby to proslo i na cerstve zalozene databazi.

-- 1) category musi mit vychozi hodnotu - novy radek se zaklada bez kategorie
ALTER TABLE "invoice_cost" ALTER COLUMN "category" SET DEFAULT '';--> statement-breakpoint

-- 2) vazba selling radku na zdrojovy buying radek (Copy from buying)
ALTER TABLE "invoice_selling_cost" ADD COLUMN IF NOT EXISTS "source_buy_id" uuid;--> statement-breakpoint

-- 3) Invoice u selling je dle mockupu vychozi zaskrtnute
ALTER TABLE "invoice_selling_cost" ALTER COLUMN "invoice" SET DEFAULT true;
