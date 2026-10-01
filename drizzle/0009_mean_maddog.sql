ALTER TABLE "balance_snapshots" ALTER COLUMN "quantity_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "journal_lines" ALTER COLUMN "quantity_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "reconciliation_records" ALTER COLUMN "quantity_minor" SET DATA TYPE numeric(78, 0);--> statement-breakpoint
ALTER TABLE "source_transactions" ALTER COLUMN "quantity_minor" SET DATA TYPE numeric(78, 0);