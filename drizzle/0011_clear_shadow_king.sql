CREATE TYPE "public"."journal_draft_status" AS ENUM('draft', 'pending', 'posted');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'approver' BEFORE 'viewer';--> statement-breakpoint
CREATE TABLE "journal_draft_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" text NOT NULL,
	"side" "journal_side" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"quantity_minor" numeric(78, 0),
	"quantity_direction" "quantity_direction",
	"asset_id" text,
	"source_id" text,
	"memo" text,
	CONSTRAINT "journal_draft_lines_amount_positive" CHECK ("journal_draft_lines"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"reference" text NOT NULL,
	"entry_date" date NOT NULL,
	"memo" text NOT NULL,
	"currency" text NOT NULL,
	"debit_minor" bigint NOT NULL,
	"credit_minor" bigint NOT NULL,
	"status" "journal_draft_status" NOT NULL,
	"prepared_by" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"posted_entry_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_drafts_balanced" CHECK ("journal_drafts"."debit_minor" = "journal_drafts"."credit_minor"),
	CONSTRAINT "journal_drafts_positive" CHECK ("journal_drafts"."debit_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "journal_draft_lines" ADD CONSTRAINT "journal_draft_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_draft_lines" ADD CONSTRAINT "journal_draft_lines_draft_id_journal_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."journal_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_draft_lines" ADD CONSTRAINT "journal_draft_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_draft_lines" ADD CONSTRAINT "journal_draft_lines_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_draft_lines" ADD CONSTRAINT "journal_draft_lines_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_drafts" ADD CONSTRAINT "journal_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_drafts" ADD CONSTRAINT "journal_drafts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_draft_lines_draft_line_unique" ON "journal_draft_lines" USING btree ("draft_id","line_number");--> statement-breakpoint
CREATE INDEX "journal_drafts_org_status_idx" ON "journal_drafts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "journal_drafts_entity_idx" ON "journal_drafts" USING btree ("entity_id");