-- A dimension row says one of two things now: "Stackable / Overstowable" or
-- "Not stackable / Not overstowable". The four old words map onto them.
UPDATE "cargo_dimension" SET "stackable" = 'Stackable / Overstowable'
  WHERE "stackable" IN ('Stackable', 'Overstowable');--> statement-breakpoint
UPDATE "cargo_dimension" SET "stackable" = 'Not stackable / Not overstowable'
  WHERE "stackable" IN ('Non-stackable', 'Non-overstowable');
