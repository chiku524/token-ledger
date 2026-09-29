CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"numerator" bigint NOT NULL,
	"scale" integer NOT NULL,
	"as_of" date NOT NULL,
	"origin" "data_origin" NOT NULL,
	"note" text NOT NULL,
	CONSTRAINT "fx_rates_numerator_positive" CHECK ("fx_rates"."numerator" > 0),
	CONSTRAINT "fx_rates_scale_non_negative" CHECK ("fx_rates"."scale" >= 0 and "fx_rates"."scale" <= 12),
	CONSTRAINT "fx_rates_distinct_currencies" CHECK ("fx_rates"."base_currency" <> "fx_rates"."quote_currency")
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "posted_by" text;--> statement-breakpoint
UPDATE "journal_entries" SET "posted_by" = 'example books' WHERE "posted_by" IS NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "posted_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "reverses_entry_id" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_organization_occurred_idx" ON "audit_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "fx_rates_pair_date_idx" ON "fx_rates" USING btree ("organization_id","base_currency","quote_currency","as_of");--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_entry_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_not_self_reversal" CHECK ("journal_entries"."reverses_entry_id" is null or "journal_entries"."reverses_entry_id" <> "journal_entries"."id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_posted_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('token_ledger.allow_journal_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Posted journals and the audit log are immutable. Post a reversal instead of editing.';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION reject_posted_journal_mutation();--> statement-breakpoint
CREATE TRIGGER journal_lines_immutable
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION reject_posted_journal_mutation();--> statement-breakpoint
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_posted_journal_mutation();