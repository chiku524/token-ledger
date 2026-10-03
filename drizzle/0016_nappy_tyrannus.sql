CREATE TYPE "public"."chain_tx_status" AS ENUM('prepared', 'submitted', 'confirmed', 'finalized', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."contract_finalization" AS ENUM('pending', 'finalized', 'failed');--> statement-breakpoint
CREATE TYPE "public"."destination_verification" AS ENUM('unverified', 'verified', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'proposed', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'leased', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "billing_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"mandate_id" text NOT NULL,
	"cycle" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"receipt_address" text NOT NULL,
	"coverage_start" timestamp with time zone NOT NULL,
	"coverage_end" timestamp with time zone NOT NULL,
	"chain_transaction_id" text,
	"collected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_charges_amount_positive" CHECK ("billing_charges"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"chain_deployment_id" text NOT NULL,
	"merchant_address" text NOT NULL,
	"vault_address" text NOT NULL,
	"vault_authority" text NOT NULL,
	"vault_token_account" text NOT NULL,
	"controller_address" text NOT NULL,
	"mint" text NOT NULL,
	"finalization" "contract_finalization" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster" text NOT NULL,
	"program_id" text NOT NULL,
	"cursor" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster" text NOT NULL,
	"service_balance_program" text NOT NULL,
	"treasury_payables_program" text NOT NULL,
	"usdc_mint" text NOT NULL,
	"token_program" text NOT NULL,
	"idl_version" text NOT NULL,
	"build_commit" text,
	"deployed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"cluster" text NOT NULL,
	"signature" text NOT NULL,
	"instruction_index" integer NOT NULL,
	"event_ordinal" integer NOT NULL,
	"program_id" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"slot" bigint,
	"block_time" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"chain_deployment_id" text NOT NULL,
	"logical_operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"attempt" integer NOT NULL,
	"signature" text,
	"recent_blockhash" text,
	"status" "chain_tx_status" NOT NULL,
	"slot" bigint,
	"error" text,
	"submitted_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"invoice_key" text NOT NULL,
	"supplier_reference" text NOT NULL,
	"normalized_reference" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"due_date" date,
	"document_hash" text,
	"document_nonce" text,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_amount_positive" CHECK ("invoices"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"kind" text NOT NULL,
	"subject_id" text,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_at" timestamp with time zone,
	"lease_owner" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"billing_vault_id" text NOT NULL,
	"mandate_address" text NOT NULL,
	"plan_address" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"price_minor" bigint NOT NULL,
	"period_seconds" integer NOT NULL,
	"max_total_debit_minor" bigint NOT NULL,
	"total_debited_minor" bigint NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"authorization_expiry" timestamp with time zone NOT NULL,
	"paid_through" timestamp with time zone NOT NULL,
	"next_cycle" bigint NOT NULL,
	"generation" bigint NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"finalization" "contract_finalization" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"payment_proposal_id" text NOT NULL,
	"approver_address" text NOT NULL,
	"approved_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"treasury_account_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"proposal_address" text NOT NULL,
	"invoice_key" text NOT NULL,
	"revision" integer NOT NULL,
	"policy_version" bigint NOT NULL,
	"recipient_owner" text NOT NULL,
	"mint" text NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"executed" boolean DEFAULT false NOT NULL,
	"finalization" "contract_finalization" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_proposals_amount_positive" CHECK ("payment_proposals"."gross_amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"treasury_account_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"payment_proposal_id" text NOT NULL,
	"cluster" text NOT NULL,
	"invoice_key" text NOT NULL,
	"recipient_owner" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"signature" text NOT NULL,
	"slot" bigint NOT NULL,
	"finalized_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settlements_amount_positive" CHECK ("payment_settlements"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "settlement_journal_links" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"journal_draft_id" text,
	"journal_entry_id" text,
	"purpose" text NOT NULL,
	"status" "journal_draft_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"address" text NOT NULL,
	"chain" text NOT NULL,
	"verification" "destination_verification" DEFAULT 'unverified' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"chain_deployment_id" text NOT NULL,
	"treasury_address" text NOT NULL,
	"treasury_authority" text NOT NULL,
	"treasury_token_account" text NOT NULL,
	"mint" text NOT NULL,
	"policy_version" bigint NOT NULL,
	"threshold" integer NOT NULL,
	"approver_count" integer NOT NULL,
	"proposer_count" integer NOT NULL,
	"per_payment_limit_minor" bigint NOT NULL,
	"daily_limit_minor" bigint NOT NULL,
	"max_proposal_lifetime_seconds" integer NOT NULL,
	"execution_paused" boolean DEFAULT false NOT NULL,
	"recovery_address" text NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"finalization" "contract_finalization" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_signers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"treasury_account_id" text NOT NULL,
	"role" text NOT NULL,
	"signer_address" text NOT NULL,
	"policy_version" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"user_id" text NOT NULL,
	"challenge_id" text,
	"cluster" text NOT NULL,
	"wallet_address" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_vaults" ADD CONSTRAINT "billing_vaults_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_vaults" ADD CONSTRAINT "billing_vaults_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_vaults" ADD CONSTRAINT "billing_vaults_chain_deployment_id_chain_deployments_id_fk" FOREIGN KEY ("chain_deployment_id") REFERENCES "public"."chain_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_events" ADD CONSTRAINT "chain_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_chain_deployment_id_chain_deployments_id_fk" FOREIGN KEY ("chain_deployment_id") REFERENCES "public"."chain_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_outbox" ADD CONSTRAINT "job_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_billing_vault_id_billing_vaults_id_fk" FOREIGN KEY ("billing_vault_id") REFERENCES "public"."billing_vaults"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_payment_proposal_id_payment_proposals_id_fk" FOREIGN KEY ("payment_proposal_id") REFERENCES "public"."payment_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proposals" ADD CONSTRAINT "payment_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proposals" ADD CONSTRAINT "payment_proposals_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proposals" ADD CONSTRAINT "payment_proposals_treasury_account_id_treasury_accounts_id_fk" FOREIGN KEY ("treasury_account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proposals" ADD CONSTRAINT "payment_proposals_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_treasury_account_id_treasury_accounts_id_fk" FOREIGN KEY ("treasury_account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_payment_proposal_id_payment_proposals_id_fk" FOREIGN KEY ("payment_proposal_id") REFERENCES "public"."payment_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_journal_links" ADD CONSTRAINT "settlement_journal_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_journal_links" ADD CONSTRAINT "settlement_journal_links_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_journal_links" ADD CONSTRAINT "settlement_journal_links_settlement_id_payment_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."payment_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_journal_links" ADD CONSTRAINT "settlement_journal_links_journal_draft_id_journal_drafts_id_fk" FOREIGN KEY ("journal_draft_id") REFERENCES "public"."journal_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_journal_links" ADD CONSTRAINT "settlement_journal_links_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_destinations" ADD CONSTRAINT "supplier_destinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_destinations" ADD CONSTRAINT "supplier_destinations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_destinations" ADD CONSTRAINT "supplier_destinations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_chain_deployment_id_chain_deployments_id_fk" FOREIGN KEY ("chain_deployment_id") REFERENCES "public"."chain_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_signers" ADD CONSTRAINT "treasury_signers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_signers" ADD CONSTRAINT "treasury_signers_treasury_account_id_treasury_accounts_id_fk" FOREIGN KEY ("treasury_account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_bindings" ADD CONSTRAINT "wallet_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_bindings" ADD CONSTRAINT "wallet_bindings_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_bindings" ADD CONSTRAINT "wallet_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_charges_mandate_cycle_unique" ON "billing_charges" USING btree ("mandate_id","cycle");--> statement-breakpoint
CREATE INDEX "billing_charges_entity_idx" ON "billing_charges" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_vaults_cluster_vault_unique" ON "billing_vaults" USING btree ("chain_deployment_id","vault_address");--> statement-breakpoint
CREATE INDEX "billing_vaults_entity_idx" ON "billing_vaults" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_cursors_cluster_program_unique" ON "chain_cursors" USING btree ("cluster","program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_deployments_cluster_unique" ON "chain_deployments" USING btree ("cluster");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_cluster_sig_ix_ordinal_unique" ON "chain_events" USING btree ("cluster","signature","instruction_index","event_ordinal");--> statement-breakpoint
CREATE INDEX "chain_events_organization_observed_idx" ON "chain_events" USING btree ("organization_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_transactions_logical_attempt_unique" ON "chain_transactions" USING btree ("logical_operation_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_transactions_signature_unique" ON "chain_transactions" USING btree ("signature");--> statement-breakpoint
CREATE INDEX "chain_transactions_organization_id_idx" ON "chain_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_entity_key_unique" ON "invoices" USING btree ("entity_id","invoice_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_entity_supplier_ref_unique" ON "invoices" USING btree ("entity_id","supplier_id","normalized_reference");--> statement-breakpoint
CREATE INDEX "invoices_organization_id_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_outbox_dedupe_key_unique" ON "job_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "job_outbox_status_available_idx" ON "job_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mandates_vault_unique" ON "mandates" USING btree ("billing_vault_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mandates_address_unique" ON "mandates" USING btree ("mandate_address");--> statement-breakpoint
CREATE INDEX "mandates_entity_idx" ON "mandates" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_approvals_proposal_approver_unique" ON "payment_approvals" USING btree ("payment_proposal_id","approver_address");--> statement-breakpoint
CREATE INDEX "payment_approvals_organization_id_idx" ON "payment_approvals" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proposals_address_unique" ON "payment_proposals" USING btree ("proposal_address");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proposals_invoice_revision_unique" ON "payment_proposals" USING btree ("invoice_id","revision");--> statement-breakpoint
CREATE INDEX "payment_proposals_treasury_idx" ON "payment_proposals" USING btree ("treasury_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlements_cluster_treasury_invoice_unique" ON "payment_settlements" USING btree ("cluster","treasury_account_id","invoice_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlements_signature_unique" ON "payment_settlements" USING btree ("signature");--> statement-breakpoint
CREATE INDEX "payment_settlements_entity_idx" ON "payment_settlements" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_journal_links_settlement_purpose_unique" ON "settlement_journal_links" USING btree ("settlement_id","purpose");--> statement-breakpoint
CREATE INDEX "settlement_journal_links_organization_id_idx" ON "settlement_journal_links" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_destinations_supplier_addr_chain_unique" ON "supplier_destinations" USING btree ("supplier_id","address","chain");--> statement-breakpoint
CREATE INDEX "supplier_destinations_organization_id_idx" ON "supplier_destinations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_entity_normalized_name_unique" ON "suppliers" USING btree ("entity_id","normalized_name");--> statement-breakpoint
CREATE INDEX "suppliers_organization_id_idx" ON "suppliers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_accounts_cluster_address_unique" ON "treasury_accounts" USING btree ("chain_deployment_id","treasury_address");--> statement-breakpoint
CREATE INDEX "treasury_accounts_entity_idx" ON "treasury_accounts" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_signers_treasury_role_addr_unique" ON "treasury_signers" USING btree ("treasury_account_id","role","signer_address");--> statement-breakpoint
CREATE INDEX "treasury_signers_organization_id_idx" ON "treasury_signers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_bindings_entity_wallet_cluster_unique" ON "wallet_bindings" USING btree ("entity_id","wallet_address","cluster");--> statement-breakpoint
CREATE INDEX "wallet_bindings_organization_id_idx" ON "wallet_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wallet_bindings_user_id_idx" ON "wallet_bindings" USING btree ("user_id");