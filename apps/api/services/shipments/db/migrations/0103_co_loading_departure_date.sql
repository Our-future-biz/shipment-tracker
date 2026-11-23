-- Co-Loading Concept, Earnings: the day a sailing leaves. The ČNB rates of that day value its box
-- costs. Council Outlay 13, decision D10.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "departure_date" date;
