# Sales, kolo B: změny databáze

Stav k 11. 10. 2026. Určeno pro toho, kdo odpovídá za databázi a nasazení.

## Shrnutí

- Změny jsou **jen v lokální vývojové databázi** na Martinově počítači a jako **šest migračních souborů** na větvi `SALES-1.0`.
- Větev je **jen lokální**. Na GitHub nebyla odeslána, do `main` nebyla sloučena a nic nebylo nasazeno. Produkční ani sdílená databáze se nezměnila.
- Všechny změny schématu jsou **přídavné**: nové sloupce, jedna nová tabulka, indexy a funkce. Žádná tabulka ani sloupec nebyl smazán, přejmenován ani nezměnil typ. Migrace nemažou žádná data.
- Před první změnou byla pořízena záloha všech osmi lokálních databází (`./zaloha.sh`): `~/Documents/Shipment Tracker/zalohy/2026-10-10_21-22`.
- Do jiné databáze se změny dostanou až tehdy, když někdo větev sloučí a nasadí. Encore aplikuje migrace při startu API.

## Proč

Audit sekce Sales našel chyby, které bez databáze opravit nešly:

- stav nabídky hlídal jen prohlížeč a hromadné akce pravidla obcházely,
- všechny obrazovky viděly jen 500 nejnovějších nabídek, protože server neuměl filtrovat podle údajů schovaných v JSON,
- ruční úkoly byly jeden sdílený JSON seznam, který si dva lidé navzájem přepisovali,
- při vytvoření zásilky z nabídky se ztrácely prodejní řádky.

## Migrace

Zobrazení všech šesti souborů:

```bash
git diff main...SALES-1.0 -- 'apps/api/services/*/db/migrations/*.sql'
```

| Služba | Soubor | Co dělá |
|---|---|---|
| quotes | `0004_quote_columns.sql` | 17 nových sloupců a 4 indexy na tabulce `quote` |
| quotes | `0005_quote_lifecycle_adopt.sql` | 6 SQL funkcí a první naplnění nových sloupců z JSON |
| quotes | `0006_quote_lifecycle_catchup.sql` | jeden příkaz, zopakuje naplnění |
| invoicing | `0014_cost_line_description.sql` | 2 nové sloupce na `invoice_cost` a 2 na `invoice_selling_cost` |
| sales | `0002_followup_task.sql` | nová tabulka `followup_task` a 6 indexů |
| sales | `0003_followup_task_import_fn.sql` | 2 SQL funkce; samy nic nekopírují |

Verze `schema_migrations` v lokální databázi po aplikaci: quotes 5, invoicing 6, sales 3. Žádná databáze není ve stavu `dirty`. Ostatní služby (auth 9, automation 1, customers 3, shipments 37, warehouse 2) tato práce neměnila.

Migrace zásilek `0035` až `0037` jsou na větvi také, ale přišly sloučením `main` (práce na Customs). V lokální databázi už byly.

### quotes `0004`: sloupce tabulky `quote`

| Sloupec | Typ | K čemu |
|---|---|---|
| `status`, `substatus`, `lost_reason`, `lost_comment` | text, NULL | stav nabídky a jeho podrobnosti |
| `sent_at`, `first_sent_at`, `decided_at`, `last_contact_at` | timestamptz, NULL | odeslání, první odeslání, rozhodnutí, poslední kontakt |
| `valid_until` | date, NULL | platnost |
| `owner_user_id` | uuid, NULL | obchodník jako uživatel (bez cizího klíče, uživatelé jsou v jiné databázi) |
| `owner_label` | text NOT NULL DEFAULT '' | jméno obchodníka jako text |
| `owner_match_checked_at` | timestamptz, NULL | kdy se text porovnal s uživateli |
| `shipment_id`, `shipment_job_number` | uuid / text, NULL | zásilka vytvořená z nabídky |
| `deleted_by` | uuid, NULL | kdo nabídku smazal |
| `data_version` | integer NOT NULL DEFAULT 1 | verze dokumentu pro bezpečné ukládání |
| `customer_id` | uuid GENERATED ALWAYS AS (…) STORED | zákazník, počítaný z `data->>'customerId'`; NULL, když hodnota není uuid |

Indexy: `quote_company_status_idx`, `quote_customer_id_idx`, `quote_owner_user_id_idx`, `quote_unadopted_idx` (částečný).

### quotes `0005` a `0006`: funkce a naplnění

- `quote_try_timestamptz`, `quote_try_date`, `quote_try_int`: převody, které na nečitelné hodnotě vrátí NULL místo chyby.
- `quote_lifecycle_of(jsonb)`: z dokumentu nabídky odvodí stav, data, platnost a obchodníka.
- `quote_adopt_lifecycle(company, include_drifted, id)`: zapíše odvozené hodnoty do nových sloupců. Opakované volání nic nezmění.
- `quote_lifecycle_drift(company)`: vrátí nabídky, u kterých se sloupce liší od dokumentu. Má vracet prázdný výsledek.

`0005` na konci jednou zavolá `quote_adopt_lifecycle`. Sloupec `data`, `updated_at` ani `terms` tím nemění. Řádky starého modulu `/quotes` (bez `quoteStatus` v JSON) zůstávají s NULL.

### invoicing `0014`

Na větvi `SALES-1.0` nesla tato migrace číslo `0006`. Při přenosu Sales na aktuální `main` (větev `SALES-1.1`, 13. 10. 2026) dostala číslo `0008`, protože `main` mezitím získal vlastní `0006_customs_invoicing` a `0007_customs_invoice_unique_per_company`. Při sloučení s `main` (14. 10. 2026) dostala číslo `0014`, protože `main` mezitím přidal `0008`–`0013` (fakturace a ČNB kurzy). Ze stejného důvodu se migrace quotes posunuly o jedno číslo (`0004`–`0007`) za `main`ovu `0003_quote_attachment_company_index`. Obsah souborů se nezměnil.

`description` a `source_quote_number` (obojí `text NOT NULL DEFAULT ''`) na `invoice_cost` a `invoice_selling_cost`. Existující řádky dostaly prázdný řetězec.

### sales `0002` a `0003`

Tabulka `followup_task`: standardní sloupce (`id`, `created_at`, `updated_at`, `deleted_at`, `company_id`) a `type`, `note`, `due_date`, `assignee_user_id`, `customer_id`, `customer_label`, `contact`, `quote_number`, `done_at`, `done_by`, `created_by`, `legacy_index`.

Funkce `sales_try_date` a `sales_import_followup_tasks(company)`. Migrace žádná data nekopíruje. Kopii starého seznamu úkolů z `sales_preference` (klíč `followup_tasks`) udělá aplikace při prvním čtení úkolů dané firmy, pod zámkem a jen jednou. Původní JSON zůstává uložený.

## Co se mění v datech za běhu

- **Stav nabídky:** zdrojem pravdy jsou nové sloupce a zapisuje je jediné místo v kódu. Stejné údaje se dál drží i v JSON, aby fungoval starý modul.
- **Platnost:** při změně stavu se v JSON místo klíče `validityDays` ukládá `validUntil`.
- **Historie:** do JSON pole `timeline` přibývají řádky se jménem a časem.
- **Obchodník:** text se jednou porovná s uživateli firmy a doplní se `owner_user_id`.
- **Smazání nabídky:** nastaví `deleted_at` a `deleted_by`; řádky příloh dostanou `deleted_at` ve stejné transakci. Soubory příloh se nemažou.
- **Náklady zásilky:** řádky zkopírované z nabídky mají vyplněné `description` a `source_quote_number`.
- **Starý seznam úkolů:** zápis přes `PUT /sales-prefs/followup_tasks` server odmítá.

## Na co myslet při nasazení

- **Zámek na tabulce `quote`:** přidání generovaného sloupce `customer_id` tabulku jednou přepíše a `0005` projde jedním UPDATE všechny nabídky. Na tisících řádků jde o krátkou chvíli, ale je to výhradní zámek.
- **Verze Postgresu:** hledání v nabídkách používá `normalize()`, tedy Postgres 13 nebo novější a databázi v UTF-8. Lokálně běží 18.3, `en_US.utf8`. Produkční verze ověřena nebyla.
- **Po nasazení zkontrolovat:**
  - `SELECT version, dirty FROM schema_migrations;` v databázích quotes, invoicing a sales,
  - `SELECT * FROM quote_lifecycle_drift();` má vrátit prázdný výsledek.
- **Vazby nabídek na zásilky** u dříve vytvořených zásilek se doplní samy při prvním načtení seznamu zásilek. Jednorázově je lze vynutit voláním `POST /shipment-quote-links/sync`.
- **Návrat ke starému kódu** je možný bez vracení schématu: nové sloupce mají výchozí hodnotu nebo jsou NULL a JSON obsahuje vše, co obsahoval dřív.
- **Větve:** API nenastartuje z větve, která nemá migrační soubory pro verzi, ve které databáze už je (Encore hlásí `no migration found for version N`). Dokud `SALES-1.0` není v `main`, lokální API běží jen z ní.

## Jak se to ověřovalo

- Každá migrace se před instalací zkoušela jako skript v transakci, která se vrátila zpět, včetně záměrně poškozených řádků (nečitelná data, špatné typy, prázdné hodnoty).
- Opakované spuštění naplnění vrací nulu změněných řádků.
- Po migracích byl sloupec `data` u všech nabídek a původní sloupce řádků nákladů bajt po bajtu shodné se stavem před nimi.
- 764 jednotkových testů API prochází.
- **Neověřeno:** nic se nezkoušelo přes přihlášenou aplikaci ani přes HTTP. Kontroly běžely nad kódem, testy a databází.

## Dodatek: kolo C (12. 10. 2026)

Kolo C **databázi nemění**: žádná migrace, žádný nový sloupec ani tabulka, žádná smazaná data. Mění jen kód.

Co se týká serveru a nasazení:

- **Zrušené adresy API (12):** deset adres starého modulu `/quotes` (vytvoření, čtení, seznam, úprava, smazání, přidělení pod-reference a čtyři adresy příloh, mezi nimi stahování souboru bez přihlášení), `POST /extraction/quote` a `GET /terms-conditions/:id`. V aplikaci je nic nevolá.
- **Data starého modulu zůstávají uložená:** řádky tabulky `quote` bez stavu, sloupec `terms`, tabulky `quote_attachment` a `quote_ref_sequence` i soubory příloh. Jen je už žádná obrazovka neukazuje.
- **Nové kontroly na serveru:** `PUT /sales-prefs/:key` přijímá jen klíče `qh_cols`, `saved_views` a `company_details` a kontroluje tvar hodnoty; `PATCH /terms-conditions/:id` umí odmítnout uložení, když šablonu mezitím změnil někdo jiný.

**Před nasazením spočítat v ostré databázi** (jen SELECT). Lokálně vychází všude nula, o ostré databázi to nic neříká.

Databáze quotes:

```sql
select company_id,
  count(*) filter (where deleted_at is null and status is null) as old_rows_live,
  count(*) filter (where deleted_at is not null and status is null) as old_rows_deleted,
  count(*) filter (where deleted_at is null and status is not null) as sales_live,
  count(*) filter (where deleted_at is null and status is not null and data ?| array['Shipper','Consignee','POL','POD','HS Code','Cargo Description','Load Type','Agent','CNTR count [1]','PCS']) as sales_with_old_fields,
  count(*) filter (where deleted_at is null and data ?| array['costs','additionalCharges','overrides','billing','generatedInvoices']) as live_with_old_cost_grid,
  count(*) filter (where deleted_at is null and btrim(terms) <> '') as live_with_terms_text
from quote group by 1;

select (select count(*) from quote_attachment where deleted_at is null) as live_attachments,
       (select count(distinct quote_number) from quote_attachment where deleted_at is null) as quotes_with_attachments,
       (select count(*) from quote_ref_sequence) as quotes_with_subrefs;
```

Databáze invoicing (zásilky, jejichž navázaná nabídka je stará reference):

```sql
select count(*) from billing_settings
where deleted_at is null and btrim(quote_ref) <> ''
  and quote_ref !~ '^QCZ[0-9]{8}[0-9]{3,}(-[0-9]+)?$';
```

Databáze sales (uložené předvolby musí projít novou kontrolou tvaru: `qh_cols` a `saved_views` pole, `company_details` objekt):

```sql
select pref_key, jsonb_typeof(value), count(*)
from sales_preference where deleted_at is null group by 1, 2;
```

Pokud `old_rows_live`, `live_attachments` nebo `live_with_old_cost_grid` nevyjdou nula, je potřeba se před nasazením rozhodnout, zda ta data jednorázově vyexportovat. Po nasazení je žádná obrazovka neukáže.

## Dodatek 2: sedmá migrace (12. 10. 2026)

Po kole C přibyla jedna migrace, na přání majitele: **quotes `0007_quote_substatus_clear.sql`**.

- Podstav stavu Feedback („Under Review", „Negotiation"…) se už nezadává, nezobrazuje ani neukládá. Migrace smaže, co z něj bylo uložené: hodnotu sloupce `quote.substatus`, klíč `substatus` v JSON dokumentu a klíče `substatus` a `fromSubstatus` v řádcích historie (`data->'timeline'`).
- **Je to jediná migrace, která maže data**, a smazání nejde vrátit jinak než ze zálohy. Týká se jen nabídek Sales (`status IS NOT NULL`).
- Nemění `updated_at`, `data_version` ani žádný jiný klíč dokumentu. Sloupec `substatus` zůstává (od teď vždy NULL), aby funkce z `0005` fungovaly dál. Druhé spuštění nic nezmění.
- Lokálně změnila 2 nabídky (jen řádky historie); `quote_lifecycle_drift()` je po ní prázdné. Verze `schema_migrations` v quotes je teď 6.
- Lokální záloha těsně před ní: `~/Documents/Shipment Tracker/zalohy/2026-10-12_15-45`.

## Obnova lokální databáze

```bash
./zaloha.sh obnov 2026-10-10_21-22
```

Obnova přepíše současná data ve všech osmi databázích, tedy i vše, co vzniklo po 10. 10. 2026 21:22.
