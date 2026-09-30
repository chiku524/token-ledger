CREATE TYPE "public"."connection_mode" AS ENUM('watch', 'exchange_read', 'custodian_read');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('pending', 'healthy', 'degraded', 'revoked');--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"quantity_minor" bigint NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	CONSTRAINT "balance_snapshots_quantity_non_negative" CHECK ("balance_snapshots"."quantity_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"mode" "connection_mode" NOT NULL,
	"venue" text NOT NULL,
	"name" text NOT NULL,
	"status" "connection_status" NOT NULL,
	"scopes" text NOT NULL,
	"cursor" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "connection_id" text;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "balance_snapshots_source_asset_as_of_unique" ON "balance_snapshots" USING btree ("source_id","asset_id","as_of");--> statement-breakpoint
CREATE INDEX "balance_snapshots_source_id_idx" ON "balance_snapshots" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "connections_organization_id_idx" ON "connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "connections_entity_id_idx" ON "connections" USING btree ("entity_id");--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sources_connection_id_idx" ON "sources" USING btree ("connection_id");