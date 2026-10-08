CREATE TYPE "public"."ai_message_role" AS ENUM('system', 'user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_status" AS ENUM('proposed', 'confirmed', 'rejected', 'ran', 'failed');--> statement-breakpoint
CREATE TABLE "ai_message_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"vector" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"entity_scope" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text,
	"tool_name" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"result" jsonb,
	"status" "ai_tool_status" NOT NULL,
	"requires_confirm" boolean DEFAULT false NOT NULL,
	"audit_event_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_message_embeddings" ADD CONSTRAINT "ai_message_embeddings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message_embeddings" ADD CONSTRAINT "ai_message_embeddings_thread_id_ai_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_message_embeddings" ADD CONSTRAINT "ai_message_embeddings_message_id_ai_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_thread_id_ai_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_threads" ADD CONSTRAINT "ai_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_threads" ADD CONSTRAINT "ai_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_thread_id_ai_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_message_id_ai_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_message_embeddings_message_unique" ON "ai_message_embeddings" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ai_message_embeddings_organization_idx" ON "ai_message_embeddings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_messages_thread_created_idx" ON "ai_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_messages_organization_idx" ON "ai_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_threads_organization_user_idx" ON "ai_threads" USING btree ("organization_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_tool_calls_thread_created_idx" ON "ai_tool_calls" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_tool_calls_organization_idx" ON "ai_tool_calls" USING btree ("organization_id");