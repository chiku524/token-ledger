CREATE TABLE "asset_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"asset_code" text NOT NULL,
	"quote_currency" text NOT NULL,
	"price_minor" numeric(78, 0) NOT NULL,
	"quote_scale" integer NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"origin" "data_origin" NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "asset_prices_price_positive" CHECK ("asset_prices"."price_minor" > 0),
	CONSTRAINT "asset_prices_quote_scale_range" CHECK ("asset_prices"."quote_scale" >= 0 and "asset_prices"."quote_scale" <= 12)
);
--> statement-breakpoint
ALTER TABLE "asset_prices" ADD CONSTRAINT "asset_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_prices_org_asset_asof_idx" ON "asset_prices" USING btree ("organization_id","asset_code","as_of");