CREATE TABLE "binding_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"cluster" text NOT NULL,
	"address" text NOT NULL,
	"domain" text NOT NULL,
	"nonce" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "binding_challenges" ADD CONSTRAINT "binding_challenges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binding_challenges" ADD CONSTRAINT "binding_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binding_challenges" ADD CONSTRAINT "binding_challenges_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "binding_challenges_nonce_unique" ON "binding_challenges" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "binding_challenges_organization_id_idx" ON "binding_challenges" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "wallet_bindings" ADD CONSTRAINT "wallet_bindings_challenge_id_binding_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."binding_challenges"("id") ON DELETE set null ON UPDATE no action;