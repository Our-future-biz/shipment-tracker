-- The m³ of one piece of a dimension line as typed, for a line whose length, width and height are not all known.
ALTER TABLE "cargo_dimension" ADD COLUMN IF NOT EXISTS "volume_per_pc_m3" text DEFAULT '' NOT NULL;
