-- Temperature Controlled (Yes / No) for the shipments grid; empty until picked.
ALTER TABLE "shipment" ADD COLUMN "temperature_controlled" text DEFAULT '' NOT NULL;