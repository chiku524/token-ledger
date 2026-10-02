CREATE TYPE "public"."reconciliation_override_kind" AS ENUM('match', 'unmatch');--> statement-breakpoint
CREATE TABLE "reconciliation_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_transaction_id" text NOT NULL,
	"journal_entry_id" text,
	"journal_line_number" integer,
	"kind" "reconciliation_override_kind" NOT NULL,
	"note" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconciliation_overrides" ADD CONSTRAINT "reconciliation_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_overrides" ADD CONSTRAINT "reconciliation_overrides_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_overrides" ADD CONSTRAINT "reconciliation_overrides_source_transaction_id_source_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."source_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_overrides_source_unique" ON "reconciliation_overrides" USING btree ("source_transaction_id");--> statement-breakpoint
CREATE INDEX "reconciliation_overrides_org_idx" ON "reconciliation_overrides" USING btree ("organization_id");