CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('crypto', 'stablecoin', 'fiat');--> statement-breakpoint
CREATE TYPE "public"."data_origin" AS ENUM('example', 'live');--> statement-breakpoint
CREATE TYPE "public"."journal_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."normal_balance" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."quantity_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('matched', 'exception');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('wallet', 'exchange', 'custodian');--> statement-breakpoint
CREATE TYPE "public"."wallet_role" AS ENUM('hot', 'cold', 'staking');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"normal_balance" "normal_balance" NOT NULL,
	"measurement_basis" text,
	"ifrs_note" text
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"chain" text,
	"decimals" integer NOT NULL,
	"asset_class" "asset_class" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"functional_currency" text NOT NULL,
	"reporting_framework" text NOT NULL,
	"parent_entity_id" text
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"reference" text NOT NULL,
	"entry_date" date NOT NULL,
	"memo" text NOT NULL,
	"currency" text NOT NULL,
	"debit_minor" bigint NOT NULL,
	"credit_minor" bigint NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "journal_entries_balanced" CHECK ("journal_entries"."debit_minor" = "journal_entries"."credit_minor"),
	CONSTRAINT "journal_entries_positive" CHECK ("journal_entries"."debit_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" text NOT NULL,
	"side" "journal_side" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"quantity_minor" bigint,
	"quantity_direction" "quantity_direction",
	"asset_id" text,
	"source_id" text,
	"memo" text,
	CONSTRAINT "journal_lines_amount_positive" CHECK ("journal_lines"."amount_minor" > 0),
	CONSTRAINT "journal_lines_quantity_positive" CHECK (("journal_lines"."quantity_minor" is null or "journal_lines"."quantity_minor" > 0))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"origin" "data_origin" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "reconciliation_status" NOT NULL,
	"source_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"direction" "quantity_direction" NOT NULL,
	"quantity_minor" bigint NOT NULL,
	"source_transaction_id" text,
	"journal_entry_id" text,
	"journal_line_number" integer,
	"note" text NOT NULL,
	CONSTRAINT "reconciliation_records_quantity_positive" CHECK ("reconciliation_records"."quantity_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "source_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"occurred_on" date NOT NULL,
	"asset_id" text NOT NULL,
	"direction" "quantity_direction" NOT NULL,
	"quantity_minor" bigint NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "source_transactions_quantity_positive" CHECK ("source_transactions"."quantity_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"role" "wallet_role",
	"name" text NOT NULL,
	"chain" text,
	"identifier" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_entity_id_fk" FOREIGN KEY ("parent_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_source_transaction_id_source_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."source_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_transactions" ADD CONSTRAINT "source_transactions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_entity_code_unique" ON "accounts" USING btree ("entity_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_organization_code_unique" ON "assets" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "entities_organization_id_idx" ON "entities" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_entity_reference_unique" ON "journal_entries" USING btree ("entity_id","reference");--> statement-breakpoint
CREATE INDEX "journal_entries_entity_date_idx" ON "journal_entries" USING btree ("entity_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_lines_entry_line_unique" ON "journal_lines" USING btree ("entry_id","line_number");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "reconciliation_records_entity_period_idx" ON "reconciliation_records" USING btree ("entity_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "source_transactions_source_external_unique" ON "source_transactions" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "source_transactions_entity_date_idx" ON "source_transactions" USING btree ("entity_id","occurred_on");--> statement-breakpoint
CREATE INDEX "sources_entity_id_idx" ON "sources" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_entity_identifier_unique" ON "sources" USING btree ("entity_id","identifier");