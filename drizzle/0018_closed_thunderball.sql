CREATE TABLE "contract_entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"mandate_id" text NOT NULL,
	"generation" bigint NOT NULL,
	"renewing" boolean NOT NULL,
	"access_until" timestamp with time zone NOT NULL,
	"cap_remaining_minor" bigint NOT NULL,
	"reason" text,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_entitlements" ADD CONSTRAINT "contract_entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_entitlements" ADD CONSTRAINT "contract_entitlements_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_entitlements" ADD CONSTRAINT "contract_entitlements_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_entitlements_mandate_generation_unique" ON "contract_entitlements" USING btree ("mandate_id","generation");--> statement-breakpoint
CREATE INDEX "contract_entitlements_entity_idx" ON "contract_entitlements" USING btree ("entity_id");