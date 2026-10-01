CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'ok', 'partial', 'failed', 'not_live');--> statement-breakpoint
CREATE TYPE "public"."sync_run_trigger" AS ENUM('manual', 'scheduled', 'webhook', 'cli');--> statement-breakpoint
CREATE TABLE "sync_run_payloads" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_run_status" NOT NULL,
	"trigger" "sync_run_trigger" NOT NULL,
	"balances_read" integer DEFAULT 0 NOT NULL,
	"movements_read" integer DEFAULT 0 NOT NULL,
	"accounts_read" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "sync_run_payloads" ADD CONSTRAINT "sync_run_payloads_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run_payloads" ADD CONSTRAINT "sync_run_payloads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run_payloads" ADD CONSTRAINT "sync_run_payloads_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_run_payloads_run_id_idx" ON "sync_run_payloads" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "sync_runs_connection_started_idx" ON "sync_runs" USING btree ("connection_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_organization_started_idx" ON "sync_runs" USING btree ("organization_id","started_at");