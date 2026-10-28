import { db, checkDatabaseConnection } from "../db/index.js";
import {
  users,
  policies,
  policyVersions,
  testRuns,
  findings,
  approvals,
  checkoutNonces,
  checkoutProposals,
  spendReservations,
  paymentOrders,
  auditEvents,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import type { PolicyDocument } from "@warrant/contracts";
import { computePolicyHash } from "@warrant/domain";

const DEMO_OPERATOR_AUTH = "demo_syn_operator";

export async function seedDemoData(): Promise<{
  success: boolean;
  durationMs: number;
  message: string;
}> {
  const startTime = Date.now();
  console.log("------------------------------------------------------------");
  console.log("VORENT — Seeding Canonical Demo Records [IDEMPOTENT]");
  console.log("------------------------------------------------------------");

  // Rule 3: Reset and seed scripts must refuse any non-localhost DATABASE_URL.
  const rawDbUrl = process.env.DATABASE_URL || "";
  let isLocalhost = false;
  try {
    const parsed = new URL(rawDbUrl);
    isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";
  } catch {
    isLocalhost = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(rawDbUrl);
  }

  if (!isLocalhost && process.env.ALLOW_NON_LOCALHOST_SEED !== "true") {
    const elapsed = Date.now() - startTime;
    console.error(
      `[REFUSED] Reset and seed scripts refuse any non-localhost DATABASE_URL for safety. Configured: ${rawDbUrl.split("@")[1] || "remote"}`
    );
    return {
      success: false,
      durationMs: elapsed,
      message: "REFUSED: Seed script requires a localhost DATABASE_URL.",
    };
  }

  const dbStatus = await checkDatabaseConnection();
  if (!dbStatus.connected) {
    const elapsed = Date.now() - startTime;
    console.error(
      `[DATABASE_UNAVAILABLE] Cannot seed demo data: PostgreSQL instance unreachable on configured DATABASE_URL (${elapsed}ms).`,
    );
    console.error(
      "Safeguard check: No SQLite or in-memory fallback shims permitted. Seed requires active PostgreSQL.",
    );
    return {
      success: false,
      durationMs: elapsed,
      message: "DATABASE_UNAVAILABLE: Active PostgreSQL required.",
    };
  }

  try {
    // If --force-reset is passed, purge existing state so the demo resets cleanly
    if (process.argv.includes("--force-reset") || process.argv.includes("--reset")) {
      console.log("[SEED] --force-reset flag detected: clearing existing tables for clean demo reset...");
      try {
        await db.delete(auditEvents);
        await db.delete(paymentOrders);
        await db.delete(spendReservations);
        await db.delete(checkoutProposals);
        await db.delete(checkoutNonces);
        await db.delete(approvals);
        await db.delete(findings);
        await db.delete(testRuns);
        await db.update(policies).set({ currentVersionId: null });
        await db.delete(policyVersions);
        await db.delete(policies);
        console.log("[SEED] Successfully reset tables to pristine state.");
      } catch (purgeErr) {
        console.warn("[SEED] Table purge encountered non-fatal warning:", purgeErr);
      }
    }
    // 1. Operator User
    let [operatorUser] = await db
      .select()
      .from(users)
      .where(eq(users.authSubject, DEMO_OPERATOR_AUTH));

    if (!operatorUser) {
      const [inserted] = await db
        .insert(users)
        .values({
          authSubject: DEMO_OPERATOR_AUTH,
        })
        .returning();
      operatorUser = inserted!;
      console.log(`[SEED] Created demo operator user: ${operatorUser.id}`);
    } else {
      console.log(`[SEED] Found existing demo operator user: ${operatorUser.id}`);
    }

    const userId = operatorUser.id;

    // 2. Policy: Autonomous Purchasing Guardrail
    let [demoPolicy] = await db
      .select()
      .from(policies)
      .where(eq(policies.ownerId, userId));

    if (!demoPolicy) {
      const [inserted] = await db
        .insert(policies)
        .values({
          ownerId: userId,
          name: "[DEMO-SYNTHETIC] Autonomous Procurement & Spend Cap Policy",
          sourceMandate:
            "Enforce strict per-item cap of $500.00 and max transaction of $750.00 across approved software vendors.",
        })
        .returning();
      demoPolicy = inserted!;
      console.log(`[SEED] Created demo policy: ${demoPolicy.id}`);
    } else {
      console.log(`[SEED] Found existing demo policy: ${demoPolicy.id}`);
    }

    const policyId = demoPolicy.id;

    // 3. Policy Version 1: Flawed version with loophole (causes Decision D-014 Warning)
    const version1Document: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 50000,
      maxCartTotalMinor: 75000,
      allowedCategories: ["software_license", "Reference Books", "Peripherals"],
      prohibitedCategories: ["Weapons", "Adult", "Gift Cards"],
      requireEvidence: true,
    };
    const v1Hash = computePolicyHash(version1Document);

    let [version1] = await db
      .select()
      .from(policyVersions)
      .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.versionNumber, 1)));

    if (!version1) {
      const [inserted] = await db
        .insert(policyVersions)
        .values({
          policyId,
          ownerId: userId,
          versionNumber: 1,
          sourceMandateSnapshot: demoPolicy.sourceMandate,
          intentSpec: {
            name: "[DEMO-SYNTHETIC] Autonomous Procurement Mandate",
            currency: "USD",
            maxItemPriceMinor: 50000,
            maxCartTotalMinor: 75000,
            allowedCategories: ["software_license", "Reference Books", "Peripherals"],
            prohibitedCategories: ["Weapons", "Adult", "Gift Cards"],
            requireEvidence: true,
          },
          policyDocument: version1Document,
          policySchemaVersion: "1.0.0",
          canonicalizationVersion: "RFC8785",
          policyHash: v1Hash,
          confirmationState: "CONFIRMED",
        })
        .returning();
      version1 = inserted!;
      console.log(`[SEED] Created policy version 1 (un-repaired): ${version1.id}`);
    } else {
      if (version1.policyHash !== v1Hash) {
        await db
          .update(policyVersions)
          .set({ policyHash: v1Hash, policyDocument: version1Document })
          .where(eq(policyVersions.id, version1.id));
        version1.policyHash = v1Hash;
        version1.policyDocument = version1Document;
      }
      console.log(`[SEED] Synchronized policy version 1: ${version1.id}`);
    }

    // 4. Test Run on Version 1: Discovers critical counterexample
    let [testRun1] = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.policyVersionId, version1.id));

    if (!testRun1) {
      const [inserted] = await db
        .insert(testRuns)
        .values({
          ownerId: userId,
          policyVersionId: version1.id,
          domainId: "procurement-checkout-domain",
          domainVersion: "1.0.0",
          domainDefinition: { domain: "ecommerce" },
          runnerVersion: "warrant-verifier-v2",
          status: "COMPLETED",
          candidateLimit: 500,
          candidateCount: 500,
          exploredCount: 500,
          findingCount: 1,
          stopReason: "COUNTEREXAMPLE_FOUND",
          startedAt: new Date(Date.now() - 3600000),
          finishedAt: new Date(Date.now() - 3590000),
          resultSummary: {
            verdict: "COUNTEREXAMPLE_FOUND",
            criticalCount: 1,
          },
        })
        .returning();
      testRun1 = inserted!;
      console.log(`[SEED] Created qualifying test run: ${testRun1.id}`);
    }

    // 5. Critical Finding: Decision D-014 trigger
    let [criticalFinding] = await db
      .select()
      .from(findings)
      .where(eq(findings.testRunId, testRun1.id));

    if (!criticalFinding) {
      const [inserted] = await db
        .insert(findings)
        .values({
          ownerId: userId,
          testRunId: testRun1.id,
          policyVersionId: version1.id,
          findingType: "ITEM_PRICE_EXCEEDS_CAP",
          severity: "CRITICAL",
          status: "OPEN",
          requirementId: "REQ-PER-ITEM-CAP",
          witness: {
            currency: "USD",
            items: [
              {
                sku: "SW-ENTERPRISE-TIER",
                title: "Developer Seat License",
                category: "software_license",
                unitPriceMinor: 65000,
                quantity: 1,
              },
            ],
          },
          evidenceSnapshot: {
            evaluatedAmountMinor: 65000,
            thresholdMinor: 50000,
            discrepancyMinor: 15000,
          },
          ruleTrace: [
            { node: "Rule-R1", status: "FAILED", condition: "UnitPrice <= 50000", actual: 65000 },
          ],
          reproduction: {
            command: "warrant-verify --policy v1 --scenario single-item-overflow",
          },
          resolutionNote:
            "[DEMO-SYNTHETIC] Decision D-014 counterexample: Enterprise tier unit price $650 exceeds $500 cap. Approval creation is fail-closed blocked.",
        })
        .returning();
      criticalFinding = inserted!;
      console.log(
        `[SEED] Created Decision D-014 Critical Finding: ${criticalFinding.id} (blocks approvals fail-closed)`,
      );
    }

    // 6. Policy Version 2: Repaired policy version
    const version2Document: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 70000,
      maxCartTotalMinor: 75000,
      allowedCategories: ["software_license", "Reference Books", "Peripherals"],
      prohibitedCategories: ["Weapons", "Adult", "Gift Cards"],
      requireEvidence: true,
    };
    const v2Hash = computePolicyHash(version2Document);

    let [version2] = await db
      .select()
      .from(policyVersions)
      .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.versionNumber, 2)));

    if (!version2) {
      const [inserted] = await db
        .insert(policyVersions)
        .values({
          policyId,
          ownerId: userId,
          versionNumber: 2,
          sourceMandateSnapshot:
            "Enforce strict per-item cap of $700.00 and max transaction of $750.00 across approved software vendors.",
          intentSpec: {
            name: "[DEMO-SYNTHETIC] Autonomous Procurement Mandate (Repaired)",
            currency: "USD",
            maxItemPriceMinor: 70000,
            maxCartTotalMinor: 75000,
            allowedCategories: ["software_license", "Reference Books", "Peripherals"],
            prohibitedCategories: ["Weapons", "Adult", "Gift Cards"],
            requireEvidence: true,
          },
          policyDocument: version2Document,
          policySchemaVersion: "1.0.0",
          canonicalizationVersion: "RFC8785",
          policyHash: v2Hash,
          confirmationState: "CONFIRMED",
        })
        .returning();
      version2 = inserted!;
      console.log(`[SEED] Created policy version 2 (repaired): ${version2.id}`);
    } else {
      if (version2.policyHash !== v2Hash) {
        await db
          .update(policyVersions)
          .set({ policyHash: v2Hash, policyDocument: version2Document })
          .where(eq(policyVersions.id, version2.id));
        version2.policyHash = v2Hash;
        version2.policyDocument = version2Document;
      }
      console.log(`[SEED] Synchronized policy version 2: ${version2.id}`);
    }

    await db
      .update(policies)
      .set({ currentVersionId: version2.id })
      .where(eq(policies.id, policyId));

    // 7. Test Run on Version 2: Clean verification run
    let [testRun2] = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.policyVersionId, version2.id));

    if (!testRun2) {
      const [inserted] = await db
        .insert(testRuns)
        .values({
          ownerId: userId,
          policyVersionId: version2.id,
          domainId: "procurement-checkout-domain",
          domainVersion: "1.0.0",
          domainDefinition: { domain: "ecommerce" },
          runnerVersion: "warrant-verifier-v2",
          status: "COMPLETED",
          candidateLimit: 500,
          candidateCount: 500,
          exploredCount: 500,
          findingCount: 0,
          stopReason: "ALL_PERMUTATIONS_SAFE",
          startedAt: new Date(Date.now() - 1800000),
          finishedAt: new Date(Date.now() - 1790000),
          resultSummary: {
            verdict: "SAFE",
            criticalCount: 0,
          },
        })
        .returning();
      testRun2 = inserted!;
      console.log(`[SEED] Created clean test run on repaired version: ${testRun2.id}`);
    }

    // 8. Active Governance Spend Approval on Version 2
    let [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.policyVersionId, version2.id));

    if (!approval) {
      const [inserted] = await db
        .insert(approvals)
        .values({
          ownerId: userId,
          policyVersionId: version2.id,
          policyHash: v2Hash,
          qualifyingTestRunId: testRun2.id,
          scope: {
            allowedCurrencies: ["USD"],
            maxSingleTransactionMinor: 75000,
            merchantCategory: "cloud_software",
          },
          spendLimitMinor: 150000, // $1,500.00
          currency: "USD",
          expiresAt: new Date(Date.now() + 7 * 24 * 3600000), // +7 days
        })
        .returning();
      approval = inserted!;
      console.log(`[SEED] Created active approval ($1,500.00 cap): ${approval.id}`);
    } else {
      if (approval.policyHash !== v2Hash) {
        await db
          .update(approvals)
          .set({ policyHash: v2Hash })
          .where(eq(approvals.id, approval.id));
        approval.policyHash = v2Hash;
      }
      console.log(`[SEED] Synchronized approval: ${approval.id}`);
    }

    // 9. Checkout Nonce
    const nonceSecret = "demo_syn_nonce_secret_001";
    const nonceHash = crypto.createHash("sha256").update(nonceSecret).digest("hex");

    let [nonce] = await db
      .select()
      .from(checkoutNonces)
      .where(eq(checkoutNonces.nonceHash, nonceHash));

    if (!nonce) {
      const [inserted] = await db
        .insert(checkoutNonces)
        .values({
          ownerId: userId,
          approvalId: approval.id,
          policyVersionId: version2.id,
          policyHash: v2Hash,
          nonceHash,
          expiresAt: new Date(Date.now() + 3600000),
          consumedAt: new Date(),
        })
        .returning();
      nonce = inserted!;
    } else if (nonce.policyHash !== v2Hash) {
      await db
        .update(checkoutNonces)
        .set({ policyHash: v2Hash })
        .where(eq(checkoutNonces.id, nonce.id));
      nonce.policyHash = v2Hash;
    }

    // 10. Checkout Proposal
    const cartHash = crypto
      .createHash("sha256")
      .update("demo_synthetic_cart_hash")
      .digest("hex");

    let [proposal] = await db
      .select()
      .from(checkoutProposals)
      .where(eq(checkoutProposals.consumedNonceId, nonce.id));

    if (!proposal) {
      const [inserted] = await db
        .insert(checkoutProposals)
        .values({
          ownerId: userId,
          approvalId: approval.id,
          policyVersionId: version2.id,
          policyHash: v2Hash,
          consumedNonceId: nonce.id,
          cartHash,
          proposedCart: {
            items: [{ name: "API Usage Credits", priceMinor: 24000, qty: 1 }],
          },
          normalizedCart: {
            currency: "USD",
            totalMinor: 24000,
          },
          evidenceSnapshot: {
            compliant: true,
          },
          decision: "ALLOW",
          reasonCodes: ["COMPLIANT_WITH_V2_LIMITS"],
          ruleTrace: { evaluatedRules: ["R1", "R2"] },
          evaluatedAt: new Date(),
        })
        .returning();
      proposal = inserted!;
    } else if (proposal.policyHash !== v2Hash) {
      await db
        .update(checkoutProposals)
        .set({ policyHash: v2Hash })
        .where(eq(checkoutProposals.id, proposal.id));
      proposal.policyHash = v2Hash;
    }

    // 11. Spend Reservation: $240.00 locked
    let [reservation] = await db
      .select()
      .from(spendReservations)
      .where(eq(spendReservations.proposalId, proposal.id));

    if (!reservation) {
      const [inserted] = await db
        .insert(spendReservations)
        .values({
          ownerId: userId,
          approvalId: approval.id,
          proposalId: proposal.id,
          amountMinor: 24000, // $240.00
          currency: "USD",
          state: "RESERVED",
          expiresAt: new Date(Date.now() + 900000),
        })
        .returning();
      reservation = inserted!;
      console.log(
        `[SEED] Created spend reservation ($240.00): ${reservation.id} [STATE: RESERVED]`,
      );
    }

    // 12. Payment Order: Sample uncaptured payment order with strict honest provenance
    // Note: Provider order ID & capture ID are null because this is a synthetic demo record.
    // We NEVER invent fake PayPal capture IDs!
    let [paymentOrder] = await db
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.idempotencyKey, "demo_syn_order_001"));

    if (!paymentOrder) {
      const [inserted] = await db
        .insert(paymentOrders)
        .values({
          ownerId: userId,
          proposalId: proposal.id,
          reservationId: reservation.id,
          provider: "PAYPAL_SANDBOX",
          idempotencyKey: "demo_syn_order_001",
          status: "CREATED",
          providerOrderId: null, // Honest null: awaiting real Sandbox checkout
          captureId: null, // Honest null: never fabricate capture IDs
          amountMinor: 24000,
          currency: "USD",
        })
        .returning();
      paymentOrder = inserted!;
      console.log(
        `[SEED] Created sample payment order: ${paymentOrder.id} [STATUS: CREATED, CAPTURE_ID: NULL]`,
      );
    }

    // 13. Audit Event: RFC 8785 canonical hash provenance
    let [auditEvent] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "DEMO_SYNTHETIC_INITIALIZATION"));

    if (!auditEvent) {
      const [inserted] = await db
        .insert(auditEvents)
        .values({
          ownerId: userId,
          actorType: "OPERATOR",
          eventType: "DEMO_SYNTHETIC_INITIALIZATION",
          entityType: "SYSTEM_INITIALIZATION",
          entityId: policyId,
          payload: {
            synthetic: true,
            label: "[DEMO-SYNTHETIC]",
            timestamp: new Date().toISOString(),
            schemaVerified: true,
          },
        })
        .returning();
      auditEvent = inserted!;
      console.log(`[SEED] Created tamper-evident audit event: ${auditEvent.id}`);
    }

    const elapsed = Date.now() - startTime;
    console.log("------------------------------------------------------------");
    console.log(
      `✓ Demo Seed Completed Successfully in ${elapsed}ms (Benchmark target: <3,000ms)`,
    );
    console.log("------------------------------------------------------------");
    return {
      success: true,
      durationMs: elapsed,
      message: `Seeded successfully in ${elapsed}ms`,
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[SEED ERROR] Failed to seed demo data after ${elapsed}ms:`, err);
    return {
      success: false,
      durationMs: elapsed,
      message: String(err),
    };
  }
}

// Direct script execution
if (process.argv[1]?.includes("seedDemoData")) {
  seedDemoData()
    .then((res) => {
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
