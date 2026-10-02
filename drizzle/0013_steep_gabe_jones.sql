CREATE TABLE "period_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"note" text NOT NULL,
	"actor" text NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_locks_range" CHECK ("period_locks"."period_start" <= "period_locks"."period_end")
);
--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "period_locks_entity_idx" ON "period_locks" USING btree ("entity_id","period_start","period_end");