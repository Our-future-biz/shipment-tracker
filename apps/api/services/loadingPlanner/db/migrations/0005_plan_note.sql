-- Loading Planner: a plan's free note for the stuffing gang and the surveyor, printed on the plan.
-- Council Outlay 14, P11.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "loading_plan" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;
