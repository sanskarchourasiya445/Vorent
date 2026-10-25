import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pool, db } from "../db/index.js";
import { buildServer } from "../server.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import {
  policies,
  policyVersions,
  testRuns,
  approvals,
  checkoutNonces,
  checkoutProposals,
  spendReservations,
} from "../db/schema.js";
import { ensureDefaultUser } from "../db/repositories/policyRepository.js";
import {
  issueCheckoutNonce,
  submitCheckoutProposal,
  calculateCommittedAndActiveSpend,
} from "../db/repositories/checkoutProposalRepository.js";
import { createApproval } from "../db/repositories/approvalRepository.js";
import { defaultPayPalService } from "../services/paypalService.js";
import { computePolicyHash } from "@warrant/domain";
import { ReasonCode, UserRole, type PolicyDocument } from "@warrant/contracts";
import type { FastifyInstance } from "fastify";

/**
 * The 8 Canonical Hackathon Invariants (PROJECT_PLAN.md Section 12).
 *
 * Invariant 1: Post-Approval Amount Tampering -> Blocked
 * Invariant 2: Post-Approval SKU / Category Swap -> Blocked
 * Invariant 3: Policy Mutation Invalidation -> STALE -> Blocked
 * Invariant 4: Incomplete Verification Guard -> Approval Blocked
 * Invariant 5: Single-Use Cryptographic Nonce Replay -> Blocked (Real PostgreSQL)
 * Invariant 6: Atomic Parallel Spend Race Serialization -> Blocked (Real PostgreSQL)
 * Invariant 7: Pre-PayPal Fail-Closed Boundary -> Zero PayPal Calls
 * Invariant 8: Zero Trust for Client Claims & Redirects -> Server Verification Only
 */
describe("Canonical 8 Must-Pass Invariant Test Suite", () => {
  let isDbLive = false;
  let server: FastifyInstance;
  const createdPolicyIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdApprovalIds: string[] = [];

  const canonicalPolicy: PolicyDocument = {
    schemaVersion: "1.0",
    currency: "USD",
    maxItemPriceMinor: 25000, // $250.00
    maxCartTotalMinor: 60000, // $600.00
    allowedCategories: ["Reference Books", "Hardware", "Peripherals"],
    prohibitedCategories: ["Gift Cards", "Weapons / Lasers", "Subscriptions & Recurring"],
    requireEvidence: true,
  };

  const canonicalEvidence = {
    quotesVerified: true,
    evidenceComplete: true,
    stale: false,
    retrievedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      isDbLive = true;

      const migrationsFolder = existsSync(resolve(process.cwd(), "drizzle/migrations"))
        ? resolve(process.cwd(), "drizzle/migrations")
        : resolve(process.cwd(), "../../drizzle/migrations");

      await migrate(db, { migrationsFolder });
    } catch {
      isDbLive = false;
    }

    server = await buildServer({
      checkDb: async () => ({
        configured: true,
        connected: isDbLive,
      }),
      paypalService: defaultPayPalService,
    });
  });

  afterAll(async () => {
    if (isDbLive) {
      for (const appId of createdApprovalIds) {
        try {
          await db.delete(spendReservations).where(eq(spendReservations.approvalId, appId));
          await db.delete(checkoutProposals).where(eq(checkoutProposals.approvalId, appId));
          await db.delete(checkoutNonces).where(eq(checkoutNonces.approvalId, appId));
          await db.delete(approvals).where(eq(approvals.id, appId));
        } catch {}
      }
      for (const runId of createdRunIds) {
        try {
          await db.delete(testRuns).where(eq(testRuns.id, runId));
        } catch {}
      }
      for (const policyId of createdPolicyIds) {
        try {
          await db.delete(policyVersions).where(eq(policyVersions.policyId, policyId));
          await db.delete(policies).where(eq(policies.id, policyId));
        } catch {}
      }
    }
    await server.close();
  });

  // Helper to create a fully verified policy + approval record
  async function setupApprovedPolicy(spendLimitMinor = 150000) {
    const ownerId = await ensureDefaultUser(db);
    const policyId = randomUUID();
    createdPolicyIds.push(policyId);

    const [policy] = await db
      .insert(policies)
      .values({
        id: policyId,
        ownerId,
        name: `Policy-${policyId.slice(0, 8)}`,
        sourceMandate: "Allow engineering hardware and books up to budget limit.",
      })
      .returning();
    if (!policy) throw new Error("Policy insert failed");

    const policyVersionId = randomUUID();
    const policyHash = computePolicyHash(canonicalPolicy);

    const [version] = await db
      .insert(policyVersions)
      .values({
        id: policyVersionId,
        policyId: policy.id,
        ownerId,
        versionNumber: 1,
        sourceMandateSnapshot: "Allow engineering hardware and books up to budget limit.",
        intentSpec: { rawPrompt: "Allow engineering hardware and books up to budget limit." },
        policyHash,
        policyDocument: canonicalPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        confirmationState: "CONFIRMED",
      })
      .returning();
    if (!version) throw new Error("PolicyVersion insert failed");

    const runId = randomUUID();
    createdRunIds.push(runId);

    const [run] = await db
      .insert(testRuns)
      .values({
        id: runId,
        ownerId,
        policyVersionId: version.id,
        domainId: "test_domain",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 500,
        exploredCount: 500,
        findingCount: 0,
        resultSummary: {},
      })
      .returning();
    if (!run) throw new Error("TestRun insert failed");

    const approvalId = randomUUID();
    createdApprovalIds.push(approvalId);

    const [approval] = await db
      .insert(approvals)
      .values({
        id: approvalId,
        ownerId,
        policyVersionId: version.id,
        policyHash,
        qualifyingTestRunId: run.id,
        scope: { allowAll: true },
        spendLimitMinor,
        currency: "USD",
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    if (!approval) throw new Error("Approval insert failed");

    return { ownerId, policy, version, policyHash, run, approval };
  }

  // --- INVARIANT 1: Post-Approval Amount Tampering -> Blocked ---
  it("Invariant 1: Post-approval amount tampering is blocked server-side (DENY: SPEND_LIMIT_EXCEEDED)", async (ctx) => {
    if (!isDbLive) {
      ctx.skip();
      return;
    }
    const { ownerId, version, policyHash, approval } = await setupApprovedPolicy(5000); // $50 limit

    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
    });

    // Cart contains an item exceeding the $50 spend limit ($750 GPU or deflated price)
    const tamperedCart = {
      currency: "USD",
      items: [
        {
          sku: "item_gpu_01", // Authoritative price is $750.00 (75000 minor)
          title: "GPU",
          category: "Hardware",
          unitPriceMinor: 4000, // Client tries to spoof price to $40.00
          quantity: 1,
        },
      ],
    };

    const result = await submitCheckoutProposal(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
      nonceId: nonce.id,
      cart: tamperedCart,
      evidenceSnapshot: canonicalEvidence,
    });

    expect(result.decision).toBe("DENY");
    expect(result.proposal.normalizedCart.items[0].unitPriceMinor).toBe(75000);
    expect(result.reservation).toBeNull();
  });

  // --- INVARIANT 2: Post-Approval SKU / Category Swap -> Blocked ---
  it("Invariant 2: Post-approval SKU/category swap to prohibited item is blocked (DENY: PROHIBITED_CATEGORY)", async (ctx) => {
    if (!isDbLive) {
      ctx.skip();
      return;
    }
    const { ownerId, version, policyHash, approval } = await setupApprovedPolicy();

    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
    });

    // Agent attempts to swap approved book for a gift card, claiming category is "Reference Books"
    const swappedCart = {
      currency: "USD",
      items: [
        {
          sku: "proh-amazon-giftcard-001",
          title: "Amazon Gift Card",
          category: "Reference Books", // Spoofed category
          unitPriceMinor: 10000,
          quantity: 1,
        },
      ],
    };

    const result = await submitCheckoutProposal(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
      nonceId: nonce.id,
      cart: swappedCart,
      evidenceSnapshot: canonicalEvidence,
    });

    expect(result.decision).toBe("DENY");
    expect(result.proposal.normalizedCart.items[0].category).toBe("Gift Cards");
    expect(result.reasonCodes).toContain(ReasonCode.PROHIBITED_CATEGORY);
    expect(result.reservation).toBeNull();
  });

  // --- INVARIANT 3: Policy Mutation Invalidation -> STALE -> Blocked ---
  it("Invariant 3: Policy mutation after approval invalidates approval with STALE hash mismatch", async (ctx) => {
    if (!isDbLive) {
      ctx.skip();
      return;
    }
    const { ownerId, version, policyHash, approval } = await setupApprovedPolicy();

    // Now policy is modified: a new hash is generated
    const mutatedHash = "f".repeat(64);

    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
    });

    // Proposal submitted with mutated hash should be rejected
    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId: approval.id,
        policyVersionId: version.id,
        policyHash: mutatedHash, // Changed hash!
        nonceId: nonce.id,
        cart: {
          currency: "USD",
          items: [{ sku: "book-ddia-001", title: "DDIA", category: "Reference Books", unitPriceMinor: 4800, quantity: 1 }],
        },
        evidenceSnapshot: canonicalEvidence,
      })
    ).rejects.toThrowError(/POLICY_HASH_MISMATCH/);
  });

  // --- INVARIANT 4: Incomplete Verification Guard -> Approval Blocked ---
  it("Invariant 4: Incomplete or failed verification run rejects approval creation (Decision D-014)", async (ctx) => {
    if (!isDbLive) {
      ctx.skip();
      return;
    }
    const ownerId = await ensureDefaultUser(db);
    const policyId = randomUUID();
    createdPolicyIds.push(policyId);

    const [policy] = await db
      .insert(policies)
      .values({
        id: policyId,
        ownerId,
        name: "Flawed Policy",
        sourceMandate: "Flawed source mandate text",
      })
      .returning();
    if (!policy) throw new Error("Policy insert failed");

    const policyVersionId = randomUUID();
    const policyHash = computePolicyHash(canonicalPolicy);

    const [version] = await db
      .insert(policyVersions)
      .values({
        id: policyVersionId,
        policyId: policy.id,
        ownerId,
        versionNumber: 1,
        sourceMandateSnapshot: "Flawed source mandate text",
        intentSpec: { rawPrompt: "Flawed" },
        policyHash,
        policyDocument: canonicalPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        confirmationState: "CONFIRMED",
      })
      .returning();
    if (!version) throw new Error("Version insert failed");

    const runId = randomUUID();
    createdRunIds.push(runId);

    // Incomplete run (ABORTED)
    await db.insert(testRuns).values({
      id: runId,
      ownerId,
      policyVersionId: version.id,
      domainId: "test_domain",
      domainVersion: "1.0.0",
      domainDefinition: {},
      runnerVersion: "1.0.0",
      status: "ABORTED",
      candidateLimit: 500,
      exploredCount: 50,
      findingCount: 5,
      resultSummary: {},
    });

    await expect(
      createApproval(
        db,
        {
          policyVersionId: version.id,
          policyHash,
          qualifyingTestRunId: runId,
          spendLimitMinor: 100000,
          currency: "USD",
          expiresInHours: 24,
        },
        ownerId
      )
    ).rejects.toThrowError(/TEST_RUN_NOT_COMPLETED|INCOMPLETE/);
  });

  // --- INVARIANT 5: Single-Use Nonce Replay -> Blocked (Real PostgreSQL) ---
  it("Invariant 5 [REAL-PG]: Single-use cryptographic nonce replay is rejected by database engine", async (ctx) => {
    if (!isDbLive) {
      ctx.skip();
      return;
    }
    const { ownerId, version, policyHash, approval } = await setupApprovedPolicy();

    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
    });

    const validCart = {
      currency: "USD",
      items: [{ sku: "book-ddia-001", title: "DDIA", category: "Reference Books", unitPriceMinor: 4800, quantity: 1 }],
    };

    // First submission: consumes nonce
    const firstResult = await submitCheckoutProposal(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
      nonceId: nonce.id,
      cart: validCart,
      evidenceSnapshot: canonicalEvidence,
    });
    expect(firstResult.decision).toBe("ALLOW");

    // Second submission with identical nonce: database unique constraint & nonce check reject replay
    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId: approval.id,
        policyVersionId: version.id,
        policyHash,
        nonceId: nonce.id,
        cart: validCart,
        evidenceSnapshot: canonicalEvidence,
      })
    ).rejects.toThrowError(/NONCE_REPLAYED/);
  });

  // --- INVARIANT 6: Atomic Parallel Spend Serialization -> Blocked (Real PostgreSQL) ---
  it("Invariant 6 [REAL-PG]: Parallel checkouts exceeding budget serialize via row lock; second fails", async (ctx) => {
    if (!isDbLive) {
      ctx.skip();
      return;
    }
    // Budget $100.00 (10,000 minor)
    const { ownerId, version, policyHash, approval } = await setupApprovedPolicy(10000);

    const nonce1 = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
    });

    const nonce2 = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: approval.id,
      policyVersionId: version.id,
      policyHash,
    });

    // Each cart is $85.00 (8,500 minor). Together they exceed $100.00 limit.
    const cartA = {
      currency: "USD",
      items: [{ sku: "book-types-prog-002", title: "Types and Programming Languages", category: "Reference Books", unitPriceMinor: 8500, quantity: 1 }],
    };
    const cartB = {
      currency: "USD",
      items: [{ sku: "book-types-prog-002", title: "Types and Programming Languages", category: "Reference Books", unitPriceMinor: 8500, quantity: 1 }],
    };

    // Dispatch concurrently
    const [resA, resB] = await Promise.all([
      submitCheckoutProposal(db, {
        ownerId,
        approvalId: approval.id,
        policyVersionId: version.id,
        policyHash,
        nonceId: nonce1.id,
        cart: cartA,
        evidenceSnapshot: canonicalEvidence,
      }),
      submitCheckoutProposal(db, {
        ownerId,
        approvalId: approval.id,
        policyVersionId: version.id,
        policyHash,
        nonceId: nonce2.id,
        cart: cartB,
        evidenceSnapshot: canonicalEvidence,
      }),
    ]);

    const decisions = [resA.decision, resB.decision];
    expect(decisions).toContain("ALLOW");
    expect(decisions).toContain("DENY");

    const totalCommitted = await calculateCommittedAndActiveSpend(db, approval.id);
    expect(totalCommitted).toBe(8500); // Exactly one was allowed, budget strictly conserved!
  });

  // --- INVARIANT 7: Pre-PayPal Fail-Closed Boundary -> Zero PayPal Calls ---
  it("Invariant 7: Non-ALLOW policy decisions never call PayPal API (zero PayPal calls)", async () => {
    const paypalSpy = vi.spyOn(defaultPayPalService, "createTestSandboxOrder");

    const response = await server.inject({
      method: "POST",
      url: "/api/checkout/proposals",
      payload: {
        approvalId: "00000000-0000-0000-0000-000000000000",
        policyVersionId: "00000000-0000-0000-0000-000000000000",
        policyHash: "0".repeat(64),
        nonceId: "00000000-0000-0000-0000-000000000000",
        cart: {
          currency: "USD",
          items: [{ sku: "proh-amazon-giftcard-001", title: "Gift Card", category: "Gift Cards", unitPriceMinor: 10000, quantity: 1 }],
        },
        evidenceSnapshot: {},
      },
    });

    expect(response.statusCode).not.toBe(201);
    expect(paypalSpy).not.toHaveBeenCalled();
    paypalSpy.mockRestore();
  });

  // --- INVARIANT 8: Zero Trust for Client Claims & Redirects ---
  it("Invariant 8: Client-supplied roles and URL redirect query parameters are ignored", async () => {
    // 1. Client cannot register as APPROVER
    const regRes = await server.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: `adversary-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Adversary",
        role: "APPROVER", // Client attempts role escalation
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regJson = regRes.json();
    expect(regJson.user.role).toBe(UserRole.REQUESTER); // Strictly defaults to REQUESTER

    // 2. Browser redirect URL parameter ?status=success cannot trick capture endpoint
    const captureRes = await server.inject({
      method: "POST",
      url: "/api/payment-orders/00000000-0000-0000-0000-000000000000/capture?status=success&payer_id=spoofed",
    });

    // Endpoint must reject because order is not in PayPal server records, ignoring query parameters
    expect(captureRes.statusCode).not.toBe(200);
  });
});
