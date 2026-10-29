-- Tariffs: the service may read and write its tables in the cloud too. There a service queries
-- its database as a role of its own, not as the role that ran the migrations and owns the tables;
-- the two share only encore_services, and these tables were never granted to it, so on staging
-- every query failed with "permission denied for table tariff" (locally encore_services may read
-- and write any table, so it never showed). Tables later migrations add are granted as they come.
GRANT SELECT, INSERT, UPDATE, DELETE ON "tariff", "tariff_version", "rail_rate", "collection_area", "collection_distance", "collection_hub", "collection_rate", "collection_region", "ocean_port", "ocean_rate" TO encore_services;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO encore_services;
