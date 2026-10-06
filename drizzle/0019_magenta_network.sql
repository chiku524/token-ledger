CREATE TABLE "merchant_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster" text NOT NULL,
	"admin_address" text NOT NULL,
	"merchant_address" text NOT NULL,
	"collector_address" text NOT NULL,
	"mint" text NOT NULL,
	"destination" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_configs_cluster_unique" ON "merchant_configs" USING btree ("cluster");