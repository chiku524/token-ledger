ALTER TABLE "users" ADD COLUMN "connection_tour_completed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users" SET "connection_tour_completed_at" = now() WHERE "role" = 'admin';