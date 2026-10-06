CREATE TABLE "merchant_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"cluster" text NOT NULL,
	"admin_address" text NOT NULL,
	"merchant_address" text NOT NULL,
	"collector_address" text NOT NULL,
	"mint" text NOT NULL,
	"destination" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchant_configs" ADD CONSTRAINT "merchant_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_configs" ADD CONSTRAINT "merchant_configs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_configs_organization_cluster_unique" ON "merchant_configs" USING btree ("organization_id","cluster");--> statement-breakpoint
CREATE INDEX "merchant_configs_entity_idx" ON "merchant_configs" USING btree ("entity_id");