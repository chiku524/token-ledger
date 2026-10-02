CREATE TYPE "public"."connection_ownership" AS ENUM('verified', 'watch_only');--> statement-breakpoint
CREATE TABLE "ownership_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"domain" text NOT NULL,
	"nonce" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "ownership" "connection_ownership" DEFAULT 'watch_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "verified_address" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "verification_signature" text;--> statement-breakpoint
ALTER TABLE "ownership_challenges" ADD CONSTRAINT "ownership_challenges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_challenges" ADD CONSTRAINT "ownership_challenges_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ownership_challenges_nonce_unique" ON "ownership_challenges" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "ownership_challenges_organization_id_idx" ON "ownership_challenges" USING btree ("organization_id");