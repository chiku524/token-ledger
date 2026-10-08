ALTER TABLE "organization_settings" ADD COLUMN "ai_provider" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "ai_model" text DEFAULT '' NOT NULL;