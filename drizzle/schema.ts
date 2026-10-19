import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  char,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// 1. Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authSubject: text("auth_subject").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

// 2. Policies
export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    sourceMandate: text("source_mandate").notNull(),
    currentVersionId: uuid("current_version_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("policies_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

// 3. Policy Versions (Immutable snapshots)
export const policyVersions = pgTable(
  "policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyId: uuid("policy_id").notNull().references(() => policies.id),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    versionNumber: integer("version_number").notNull(),
    sourceMandateSnapshot: text("source_mandate_snapshot").notNull(),
    intentSpec: jsonb("intent_spec").notNull(),
    policyDocument: jsonb("policy_document").notNull(),
    policySchemaVersion: text("policy_schema_version").notNull(),
    canonicalizationVersion: text("canonicalization_version").notNull(),
    policyHash: char("policy_hash", { length: 64 }).notNull(),
    confirmationState: text("confirmation_state").notNull(), // DRAFT | CONFIRMED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("policy_version_unique_idx").on(table.policyId, table.versionNumber),
    index("policy_version_owner_idx").on(table.ownerId, table.policyId, table.versionNumber),
  ],
);

// 4. Intent Examples
export const intentExamples = pgTable(
  "intent_examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    expectedDecision: text("expected_decision").notNull(), // ALLOW | DENY | REVIEW
    label: text("label").notNull(),
    scenario: jsonb("scenario").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("intent_examples_version_idx").on(table.policyVersionId),
  ],
);

// 5. Test Runs (Bounded search runs)
export const testRuns = pgTable(
  "test_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
    domainId: text("domain_id").notNull(),
    domainVersion: text("domain_version").notNull(),
    domainDefinition: jsonb("domain_definition").notNull(),
    runnerVersion: text("runner_version").notNull(),
    status: text("status").notNull(), // QUEUED | RUNNING | COMPLETED | INCOMPLETE | FAILED | CANCELLED
    candidateLimit: integer("candidate_limit").notNull(),
    candidateCount: bigint("candidate_count", { mode: "number" }).notNull().default(0),
    exploredCount: bigint("explored_count", { mode: "number" }).notNull().default(0),
    findingCount: integer("finding_count").notNull().default(0),
    stopReason: text("stop_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    resultSummary: jsonb("result_summary").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("test_runs_owner_policy_idx").on(table.ownerId, table.policyVersionId, table.createdAt),
  ],
);

// 6. Findings & Witnesses
export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    testRunId: uuid("test_run_id").notNull().references(() => testRuns.id),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
    findingType: text("finding_type").notNull(),
    severity: text("severity").notNull(), // CRITICAL | HIGH | MEDIUM | LOW
    status: text("status").notNull(), // OPEN | RESOLVED | ACCEPTED_RISK
    requirementId: text("requirement_id"),
    witness: jsonb("witness").notNull(),
    evidenceSnapshot: jsonb("evidence_snapshot").notNull(),
    ruleTrace: jsonb("rule_trace").notNull(),
    reproduction: jsonb("reproduction").notNull(),
    resolvedByVersionId: uuid("resolved_by_version_id").references(() => policyVersions.id),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("findings_owner_status_idx").on(table.ownerId, table.status, table.createdAt),
    index("findings_run_idx").on(table.testRunId, table.createdAt),
  ],
);

// 7. Approvals
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
    policyHash: char("policy_hash", { length: 64 }).notNull(),
    qualifyingTestRunId: uuid("qualifying_test_run_id").notNull().references(() => testRuns.id),
    scope: jsonb("scope").notNull(),
    spendLimitMinor: bigint("spend_limit_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("approvals_owner_version_idx").on(table.ownerId, table.policyVersionId, table.createdAt),
  ],
);

// 8. Checkout Nonces (Single-use server-issued anti-replay tokens)
export const checkoutNonces = pgTable(
  "checkout_nonces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    approvalId: uuid("approval_id").notNull().references(() => approvals.id),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
    policyHash: char("policy_hash", { length: 64 }).notNull(),
    nonceHash: char("nonce_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("nonces_owner_approval_idx").on(table.ownerId, table.approvalId),
  ],
);

// 9. Checkout Proposals
export const checkoutProposals = pgTable(
  "checkout_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    approvalId: uuid("approval_id").notNull().references(() => approvals.id),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
    policyHash: char("policy_hash", { length: 64 }).notNull(),
    consumedNonceId: uuid("consumed_nonce_id").notNull().unique().references(() => checkoutNonces.id),
    cartHash: char("cart_hash", { length: 64 }).notNull(),
    proposedCart: jsonb("proposed_cart").notNull(),
    normalizedCart: jsonb("normalized_cart").notNull(),
    evidenceSnapshot: jsonb("evidence_snapshot").notNull(),
    decision: text("decision").notNull(), // ALLOW | DENY | REVIEW
    reasonCodes: jsonb("reason_codes").notNull(),
    ruleTrace: jsonb("rule_trace").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("proposals_owner_decision_idx").on(table.ownerId, table.decision, table.createdAt),
  ],
);

// 10. Spend Reservations (Atomic lifetime spend accounting)
export const spendReservations = pgTable(
  "spend_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    approvalId: uuid("approval_id").notNull().references(() => approvals.id),
    proposalId: uuid("proposal_id").notNull().references(() => checkoutProposals.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    state: text("state").notNull(), // ORDER_CREATION_PENDING | RESERVED | COMMITTED | RELEASED | RECONCILIATION_HOLD
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reservations_approval_state_idx").on(table.approvalId, table.state),
  ],
);

// 11. Payment Orders (PayPal Sandbox integration)
export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    proposalId: uuid("proposal_id").notNull().references(() => checkoutProposals.id),
    reservationId: uuid("reservation_id").notNull().references(() => spendReservations.id),
    provider: text("provider").notNull().default("PAYPAL_SANDBOX"),
    providerOrderId: text("provider_order_id").unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull(), // CREATED | PAYER_ACTION_REQUIRED | CAPTURE_PENDING | CAPTURED | FAILED | CANCELLED | UNKNOWN_REQUIRES_RECONCILIATION
    captureId: text("capture_id"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_orders_owner_idx").on(table.ownerId, table.status),
  ],
);

// 12. Audit Events (Append-only security log)
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id),
    actorType: text("actor_type").notNull(), // USER | AGENT | SYSTEM
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);
