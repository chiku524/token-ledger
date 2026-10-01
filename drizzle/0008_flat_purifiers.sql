CREATE TYPE "public"."match_job_status" AS ENUM('queued', 'done');--> statement-breakpoint
CREATE TABLE "match_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_id" text NOT NULL,
	"status" "match_job_status" NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source_id" text NOT NULL,
	"delivery_id" text,
	"external_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"raw_body" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_jobs" ADD CONSTRAINT "match_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_jobs" ADD CONSTRAINT "match_jobs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_jobs" ADD CONSTRAINT "match_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_jobs_status_enqueued_idx" ON "match_jobs" USING btree ("status","enqueued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_source_external_unique" ON "webhook_events" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "webhook_events_organization_received_idx" ON "webhook_events" USING btree ("organization_id","received_at");