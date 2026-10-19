CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"policy_hash" char(64) NOT NULL,
	"qualifying_test_run_id" uuid NOT NULL,
	"scope" jsonb NOT NULL,
	"spend_limit_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"actor_type" text NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"policy_hash" char(64) NOT NULL,
	"nonce_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_nonces_nonce_hash_unique" UNIQUE("nonce_hash")
);
--> statement-breakpoint
CREATE TABLE "checkout_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"policy_hash" char(64) NOT NULL,
	"consumed_nonce_id" uuid NOT NULL,
	"cart_hash" char(64) NOT NULL,
	"proposed_cart" jsonb NOT NULL,
	"normalized_cart" jsonb NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"decision" text NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"rule_trace" jsonb NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"test_run_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"finding_type" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"requirement_id" text,
	"witness" jsonb NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"rule_trace" jsonb NOT NULL,
	"reproduction" jsonb NOT NULL,
	"resolved_by_version_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "intent_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"expected_decision" text NOT NULL,
	"label" text NOT NULL,
	"scenario" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"provider" text DEFAULT 'PAYPAL_SANDBOX' NOT NULL,
	"provider_order_id" text,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"capture_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payment_orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_mandate" text NOT NULL,
	"current_version_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"source_mandate_snapshot" text NOT NULL,
	"intent_spec" jsonb NOT NULL,
	"policy_document" jsonb NOT NULL,
	"policy_schema_version" text NOT NULL,
	"canonicalization_version" text NOT NULL,
	"policy_hash" char(64) NOT NULL,
	"confirmation_state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"domain_id" text NOT NULL,
	"domain_version" text NOT NULL,
	"domain_definition" jsonb NOT NULL,
	"runner_version" text NOT NULL,
	"status" text NOT NULL,
	"candidate_limit" integer NOT NULL,
	"candidate_count" bigint DEFAULT 0 NOT NULL,
	"explored_count" bigint DEFAULT 0 NOT NULL,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"stop_reason" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_auth_subject_unique" UNIQUE("auth_subject")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_qualifying_test_run_id_test_runs_id_fk" FOREIGN KEY ("qualifying_test_run_id") REFERENCES "public"."test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_nonces" ADD CONSTRAINT "checkout_nonces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_nonces" ADD CONSTRAINT "checkout_nonces_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_nonces" ADD CONSTRAINT "checkout_nonces_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_consumed_nonce_id_checkout_nonces_id_fk" FOREIGN KEY ("consumed_nonce_id") REFERENCES "public"."checkout_nonces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_test_run_id_test_runs_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_resolved_by_version_id_policy_versions_id_fk" FOREIGN KEY ("resolved_by_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_examples" ADD CONSTRAINT "intent_examples_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_examples" ADD CONSTRAINT "intent_examples_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_proposal_id_checkout_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."checkout_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_reservation_id_spend_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."spend_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_reservations" ADD CONSTRAINT "spend_reservations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_reservations" ADD CONSTRAINT "spend_reservations_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_reservations" ADD CONSTRAINT "spend_reservations_proposal_id_checkout_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."checkout_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_owner_version_idx" ON "approvals" USING btree ("owner_id","policy_version_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_owner_created_idx" ON "audit_events" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "nonces_owner_approval_idx" ON "checkout_nonces" USING btree ("owner_id","approval_id");--> statement-breakpoint
CREATE INDEX "proposals_owner_decision_idx" ON "checkout_proposals" USING btree ("owner_id","decision","created_at");--> statement-breakpoint
CREATE INDEX "findings_owner_status_idx" ON "findings" USING btree ("owner_id","status","created_at");--> statement-breakpoint
CREATE INDEX "findings_run_idx" ON "findings" USING btree ("test_run_id","created_at");--> statement-breakpoint
CREATE INDEX "intent_examples_version_idx" ON "intent_examples" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "payment_orders_owner_idx" ON "payment_orders" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "policies_owner_updated_idx" ON "policies" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_version_unique_idx" ON "policy_versions" USING btree ("policy_id","version_number");--> statement-breakpoint
CREATE INDEX "policy_version_owner_idx" ON "policy_versions" USING btree ("owner_id","policy_id","version_number");--> statement-breakpoint
CREATE INDEX "reservations_approval_state_idx" ON "spend_reservations" USING btree ("approval_id","state");--> statement-breakpoint
CREATE INDEX "test_runs_owner_policy_idx" ON "test_runs" USING btree ("owner_id","policy_version_id","created_at");