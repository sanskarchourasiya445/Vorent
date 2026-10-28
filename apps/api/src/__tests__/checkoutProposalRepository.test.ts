import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  issueCheckoutNonce,
  calculateCommittedAndActiveSpend,
  submitCheckoutProposal,
} from "../db/repositories/checkoutProposalRepository.js";
import { ReasonCode } from "@warrant/contracts";
import { computePolicyHash } from "@warrant/domain";

import { getTableName } from "drizzle-orm";

function evaluateCondition(condition: any, item: any): boolean {
  if (!condition) return true;
  if (typeof condition === "function") return condition(item);
  if (condition.fn) return condition.fn(item);

  if (condition.queryChunks) {
    const chunks = condition.queryChunks;

    // Check if chunks contains a sub-SQL with "and"
    for (const chunk of chunks) {
      if (chunk && chunk.queryChunks && Array.isArray(chunk.queryChunks)) {
        const hasAnd = chunk.queryChunks.some(
          (c: any) =>
            (typeof c === "string" && c.toLowerCase().includes("and")) ||
            (c?.value && Array.isArray(c.value) && c.value.some((v: any) => typeof v === "string" && v.toLowerCase().includes("and")))
        );
        if (hasAnd) {
          const subSqls = chunk.queryChunks.filter((c: any) => c && c.queryChunks);
          return subSqls.every((s: any) => evaluateCondition(s, item));
        }
      }
    }

    // Check isNull: ' is null'
    const isNullOp = chunks.some(
      (c: any) =>
        (typeof c === "string" && c.toLowerCase().includes("is null")) ||
        (c?.value && Array.isArray(c.value) && c.value.some((v: any) => typeof v === "string" && v.toLowerCase().includes("is null")))
    );
    if (isNullOp) {
      const col = chunks.find((c: any) => c && c.name);
      if (col) {
        let propKey = col.name;
        if (col.table) {
          for (const key of Object.keys(col.table)) {
            if (col.table[key] === col) {
              propKey = key;
              break;
            }
          }
        }
        return item[propKey] === null || item[col.name] === null || item[propKey] === undefined;
      }
    }

    // Check inArray: ' in '
    const inOp = chunks.some(
      (c: any) =>
        (typeof c === "string" && c.toLowerCase().includes("in")) ||
        (c?.value && Array.isArray(c.value) && c.value.some((v: any) => typeof v === "string" && v.toLowerCase().includes("in")))
    );
    if (inOp) {
      const col = chunks.find((c: any) => c && c.name);
      const arrVal = chunks.find((c: any, idx: number) => idx > 1 && (!c || c.constructor?.name !== "StringChunk"));
      let arr: any[] = [];
      if (Array.isArray(arrVal)) {
        arr = arrVal.map((x: any) => (x && typeof x === "object" && "value" in x ? x.value : x));
      } else if (arrVal && Array.isArray(arrVal.values || arrVal.value)) {
        arr = arrVal.values || arrVal.value;
      }
      if (col) {
        let propKey = col.name;
        if (col.table) {
          for (const key of Object.keys(col.table)) {
            if (col.table[key] === col) {
              propKey = key;
              break;
            }
          }
        }
        const val = item[propKey] ?? item[col.name];
        return arr.includes(val);
      }
    }

    // Check eq: ' = '
    const eqOp = chunks.some(
      (c: any) =>
        (typeof c === "string" && c.toLowerCase().includes("=")) ||
        (c?.value && Array.isArray(c.value) && c.value.some((v: any) => typeof v === "string" && v.toLowerCase().includes("=")))
    );
    if (eqOp) {
      const col = chunks.find((c: any) => c && c.name);
      const rawVal = chunks.find((c: any, idx: number) => idx > 1 && (!c || c.constructor?.name !== "StringChunk"));
      if (col && rawVal !== undefined) {
        const targetVal = rawVal && typeof rawVal === "object" && "value" in rawVal ? rawVal.value : rawVal;
        let propKey = col.name;
        if (col.table) {
          for (const key of Object.keys(col.table)) {
            if (col.table[key] === col) {
              propKey = key;
              break;
            }
          }
        }
        return item[propKey] === targetVal || item[col.name] === targetVal;
      }
    }
  }

  return true;
}

/**
 * In-memory test double supporting transaction-style table stores for
 * users, approvals, checkout_nonces, checkout_proposals, spend_reservations, and policy_versions.
 */
function createMockDb() {
  const usersStore: any[] = [];
  const approvalsStore: any[] = [];
  const checkoutNoncesStore: any[] = [];
  const checkoutProposalsStore: any[] = [];
  const spendReservationsStore: any[] = [];
  const policyVersionsStore: any[] = [];

  const getStore = (table: any): any[] => {
    try {
      const name = getTableName(table);
      if (name === "users") return usersStore;
      if (name === "approvals") return approvalsStore;
      if (name === "checkout_nonces") return checkoutNoncesStore;
      if (name === "checkout_proposals") return checkoutProposalsStore;
      if (name === "spend_reservations") return spendReservationsStore;
      if (name === "policy_versions") return policyVersionsStore;
    } catch {
      // fallback
    }
    const name = table?._?.name || table?.name || (typeof table === "string" ? table : "");
    if (name === "users") return usersStore;
    if (name === "approvals") return approvalsStore;
    if (name === "checkout_nonces") return checkoutNoncesStore;
    if (name === "checkout_proposals") return checkoutProposalsStore;
    if (name === "spend_reservations") return spendReservationsStore;
    if (name === "policy_versions") return policyVersionsStore;
    return [];
  };

  const createQueryBuilder = () => {
    let currentStore: any[] = [];
    let whereFilter: ((item: any) => boolean) | null = null;

    const builder: any = {
      from(table: any) {
        currentStore = getStore(table);
        return builder;
      },
      select(_fields?: any) {
        return builder;
      },
      where(condition: any) {
        whereFilter = (item: any) => evaluateCondition(condition, item);
        return builder;
      },
      for(_mode: string) {
        return builder;
      },
      limit(_n: number) {
        return builder;
      },
      insert(table: any) {
        currentStore = getStore(table);
        return {
          values(val: any) {
            const row = { ...val };
            currentStore.push(row);
            return {
              returning: async () => [row],
              then: (resolve: any) => resolve([row]),
            };
          },
        };
      },
      update(table: any) {
        currentStore = getStore(table);
        return {
          set(changes: any) {
            return {
              where(cond: any) {
                const affected: any[] = [];
                for (const item of currentStore) {
                  const match = evaluateCondition(cond, item);
                  if (match) {
                    Object.assign(item, changes);
                    affected.push(item);
                  }
                }
                return {
                  returning: async () => affected,
                  then: (resolve: any) => resolve(affected),
                };
              },
            };
          },
        };
      },
      then(resolve: any) {
        let results = [...currentStore];
        if (whereFilter) {
          results = results.filter(whereFilter);
        }
        return resolve(results);
      },
    };

    return builder;
  };

  const db: any = {
    _stores: {
      usersStore,
      approvalsStore,
      checkoutNoncesStore,
      checkoutProposalsStore,
      spendReservationsStore,
      policyVersionsStore,
    },
    select: () => createQueryBuilder(),
    insert: (table: any) => createQueryBuilder().insert(table),
    update: (table: any) => createQueryBuilder().update(table),
    transaction: async (cb: any) => {
      // Execute callback with db as tx context
      return await cb(db);
    },
  };

  return db;
}

describe("Checkout Proposal Repository", () => {
  let db: any;
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const policyVersionId = "22222222-2222-2222-2222-222222222222";
  const approvalId = "33333333-3333-3333-3333-333333333333";

  const policyDoc = {
    schemaVersion: "1.0" as const,
    currency: "USD",
    maxItemPriceMinor: 10000,
    maxCartTotalMinor: 20000,
    allowedCategories: ["Books", "Electronics"],
    prohibitedCategories: ["Gift Cards", "Weapons"],
    requireEvidence: true,
  };
  const policyHash = computePolicyHash(policyDoc);

  const sampleCart = {
    currency: "USD",
    items: [
      {
        sku: "SKU-BOOK",
        title: "Clean Code",
        category: "Books",
        unitPriceMinor: 4000,
        quantity: 1,
      },
    ],
  };

  const sampleEvidence = {
    quotesVerified: true,
    evidenceComplete: true,
    stale: false,
  };

  beforeEach(() => {
    db = createMockDb();

    // Populate default policy version
    db._stores.policyVersionsStore.push({
      id: policyVersionId,
      ownerId,
      versionNumber: 1,
      policyDocument: policyDoc,
      policyHash,
    });

    // Populate active approval with $100.00 (10000 minor) limit
    db._stores.approvalsStore.push({
      id: approvalId,
      ownerId,
      policyVersionId,
      policyHash,
      spendLimitMinor: 10000,
      currency: "USD",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      revokedAt: null,
    });
  });

  it("issues a checkout nonce with SHA-256 hash and future expiration", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      ttlSeconds: 300,
    });

    expect(nonce.id).toBeDefined();
    expect(nonce.rawNonce).toMatch(/^[a-f0-9]{64}$/);
    expect(nonce.nonceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(nonce.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("calculates active and committed spend correctly (includes PENDING, RESERVED, COMMITTED, RECONCILIATION_HOLD; excludes RELEASED)", async () => {
    db._stores.spendReservationsStore.push(
      { id: randomUUID(), approvalId, amountMinor: 2000, state: "COMMITTED" },
      { id: randomUUID(), approvalId, amountMinor: 1500, state: "ORDER_CREATION_PENDING" },
      { id: randomUUID(), approvalId, amountMinor: 1000, state: "RESERVED" },
      { id: randomUUID(), approvalId, amountMinor: 500, state: "RECONCILIATION_HOLD" },
      { id: randomUUID(), approvalId, amountMinor: 9999, state: "RELEASED" } // strictly excluded!
    );

    const spend = await calculateCommittedAndActiveSpend(db, approvalId);
    expect(spend).toBe(5000); // 2000 + 1500 + 1000 + 500 = 5000
  });

  it("submits valid checkout proposal and creates ORDER_CREATION_PENDING reservation atomically", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    const result = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce.id,
      cart: sampleCart,
      evidenceSnapshot: sampleEvidence,
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.proposal.consumedNonceId).toBe(nonce.id);
    expect(result.reservation).toBeDefined();
    expect(result.reservation?.state).toBe("ORDER_CREATION_PENDING");
    expect(result.reservation?.amountMinor).toBe(4000);

    // Verify nonce was marked consumed in store
    const storedNonce = db._stores.checkoutNoncesStore.find((n: any) => n.id === nonce.id);
    expect(storedNonce?.consumedAt).not.toBeNull();
  });

  it("rejects nonce replay when same nonce is submitted a second time", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    // First submission succeeds
    const first = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce.id,
      cart: sampleCart,
      evidenceSnapshot: sampleEvidence,
    });
    expect(first.decision).toBe("ALLOW");

    // Replay attempt with same nonce must be rejected
    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId,
        policyVersionId,
        policyHash,
        nonceId: nonce.id,
        cart: sampleCart,
        evidenceSnapshot: sampleEvidence,
      })
    ).rejects.toThrowError(/NONCE_REPLAYED/);
  });

  it("enforces lifetime spend limit: denies proposal when cumulative spend exceeds approval cap and does NOT create reservation", async () => {
    // Existing spend is 8000 out of 10000 limit
    db._stores.spendReservationsStore.push({
      id: randomUUID(),
      approvalId,
      amountMinor: 8000,
      state: "COMMITTED",
    });

    // Cart total is 4000 (8000 + 4000 = 12000 > 10000 cap)
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    const result = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce.id,
      cart: sampleCart,
      evidenceSnapshot: sampleEvidence,
    });

    expect(result.decision).toBe("DENY");
    expect(result.reasonCodes).toContain(ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED);
    expect(result.reservation).toBeNull(); // No reservation created for DENY!
  });

  it("rejects proposal on currency mismatch with approval", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    const eurCart = { ...sampleCart, currency: "EUR" };

    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId,
        policyVersionId,
        policyHash,
        nonceId: nonce.id,
        cart: eurCart,
        evidenceSnapshot: sampleEvidence,
      })
    ).rejects.toThrowError(/CURRENCY_MISMATCH/);
  });

  it("rejects expired checkout nonce", async () => {
    const expiredNonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      ttlSeconds: -10, // already expired
    });

    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId,
        policyVersionId,
        policyHash,
        nonceId: expiredNonce.id,
        cart: sampleCart,
        evidenceSnapshot: sampleEvidence,
      })
    ).rejects.toThrowError(/NONCE_EXPIRED/);
  });

  it("rejects nonce bound to a different approval (anti-tampering)", async () => {
    const anotherApprovalId = randomUUID();
    const nonceForOtherApproval = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: anotherApprovalId,
      policyVersionId,
      policyHash,
    });

    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId,
        policyVersionId,
        policyHash,
        nonceId: nonceForOtherApproval.id,
        cart: sampleCart,
        evidenceSnapshot: sampleEvidence,
      })
    ).rejects.toThrowError(/NONCE_BINDING_MISMATCH/);
  });

  it("rejects proposal when approval has been revoked", async () => {
    const revokedApprovalId = randomUUID();
    db._stores.approvalsStore.push({
      id: revokedApprovalId,
      ownerId,
      policyVersionId,
      policyHash,
      spendLimitMinor: 10000,
      currency: "USD",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      revokedAt: new Date(),
    });

    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId: revokedApprovalId,
      policyVersionId,
      policyHash,
    });

    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId: revokedApprovalId,
        policyVersionId,
        policyHash,
        nonceId: nonce.id,
        cart: sampleCart,
        evidenceSnapshot: sampleEvidence,
      })
    ).rejects.toThrowError(/REVOKED_APPROVAL/);
  });

  it("rejects proposal when stored policy document has been modified/tampered (hash mismatch)", async () => {
    // Simulate stored policy document having been modified without regenerating policyHash
    const tamperedPolicyDoc = {
      ...policyDoc,
      maxCartTotalMinor: 999999, // tampered limit
    };
    const tamperedVersionId = randomUUID();
    db._stores.policyVersionsStore.push({
      id: tamperedVersionId,
      ownerId,
      versionNumber: 2,
      policyDocument: tamperedPolicyDoc,
      policyHash, // Claiming it matches the approved policyHash
    });

    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId: tamperedVersionId,
      policyHash,
    });

    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId,
        policyVersionId: tamperedVersionId,
        policyHash,
        nonceId: nonce.id,
        cart: sampleCart,
        evidenceSnapshot: sampleEvidence,
      })
    ).rejects.toThrowError(/POLICY_HASH_MISMATCH/);
  });

  it("evaluates stale evidence to REVIEW and creates zero spend reservation", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    const staleEvidence = {
      ...sampleEvidence,
      snapshotTimestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours old (> 1 hr staleness threshold)
    };

    const result = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce.id,
      cart: sampleCart,
      evidenceSnapshot: staleEvidence,
    });

    expect(result.decision).toBe("REVIEW");
    expect(result.reasonCodes).toContain("STALE_EVIDENCE");
    expect(result.reservation).toBeNull(); // Zero reservation created on REVIEW
  });

  it("ensures denied checkout proposal does not consume budget on subsequent checkouts", async () => {
    // 1. First proposal violates policy (e.g. prohibited category) -> DENY
    const nonce1 = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    const prohibitedCart = {
      currency: "USD",
      items: [
        {
          sku: "SKU-GIFT-CARD",
          title: "Amazon Gift Card",
          category: "Gift Cards",
          unitPriceMinor: 5000,
          quantity: 1,
        },
      ],
    };

    const result1 = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce1.id,
      cart: prohibitedCart,
      evidenceSnapshot: sampleEvidence,
    });

    expect(result1.decision).toBe("DENY");
    expect(result1.reservation).toBeNull();

    // Verify committed and active spend remains 0
    const spendAfterDeny = await calculateCommittedAndActiveSpend(db, approvalId);
    expect(spendAfterDeny).toBe(0);

    // 2. Second proposal with compliant cart succeeds within limit
    const nonce2 = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    const result2 = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce2.id,
      cart: sampleCart,
      evidenceSnapshot: sampleEvidence,
    });

    expect(result2.decision).toBe("ALLOW");
    expect(result2.reservation).toBeDefined();
    expect(result2.reservation?.amountMinor).toBe(4000);

    const spendAfterAllow = await calculateCommittedAndActiveSpend(db, approvalId);
    expect(spendAfterAllow).toBe(4000);
  });

  it("enforces price trust boundary: client-supplied deflated price on catalog SKU is overridden by authoritative catalog price and DENIED if exceeding limit", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    // Client/AI Agent attempts to purchase $1,299 studio display by forging unitPriceMinor to $1.00 (100 minor)
    const spoofedCart = {
      currency: "USD",
      items: [
        {
          sku: "hw-studio-display-004",
          title: "Forged Cheap Display",
          category: "Hardware",
          unitPriceMinor: 100, // Spoofed $1.00
          quantity: 1,
        },
      ],
    };

    const result = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce.id,
      cart: spoofedCart,
      evidenceSnapshot: sampleEvidence,
    });

    // Server normalized cart to authoritative $1,299.00 (129900 minor), exceeding per-item limit ($700) and cart limit ($750)
    expect(result.decision).toBe("DENY");
    expect(result.proposal.normalizedCart.items[0].unitPriceMinor).toBe(129900);
    expect(result.reservation).toBeNull();
  });

  it("enforces category trust boundary: client-supplied spoofed category on prohibited SKU is overridden by authoritative catalog and DENIED with PROHIBITED_CATEGORY", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    // Client/AI Agent attempts to buy a gift card by claiming it's "Reference Books"
    const spoofedCart = {
      currency: "USD",
      items: [
        {
          sku: "proh-amazon-giftcard-001",
          title: "Claimed Reference Book",
          category: "Reference Books", // Spoofed category
          unitPriceMinor: 10000,
          quantity: 1,
        },
      ],
    };

    const result = await submitCheckoutProposal(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
      nonceId: nonce.id,
      cart: spoofedCart,
      evidenceSnapshot: sampleEvidence,
    });

    // Server normalized category to authoritative "Gift Cards", which is prohibited
    expect(result.decision).toBe("DENY");
    expect(result.proposal.normalizedCart.items[0].category).toBe("Gift Cards");
    expect(result.reasonCodes).toContain(ReasonCode.PROHIBITED_CATEGORY);
    expect(result.reservation).toBeNull();
  });

  it("fails closed and throws UNKNOWN_CATALOG_SKU when an item is not in the authoritative catalog (PAY-001)", async () => {
    const nonce = await issueCheckoutNonce(db, {
      ownerId,
      approvalId,
      policyVersionId,
      policyHash,
    });

    const unknownSkuCart = {
      currency: "USD",
      items: [
        {
          sku: "unlisted-fake-hardware-sku-999",
          title: "Malicious Zero Price Exploit",
          quantity: 1,
        },
      ],
    };

    await expect(
      submitCheckoutProposal(db, {
        ownerId,
        approvalId,
        policyVersionId,
        policyHash,
        nonceId: nonce.id,
        cart: unknownSkuCart as any,
        evidenceSnapshot: sampleEvidence,
      })
    ).rejects.toThrowError(/UNKNOWN_CATALOG_SKU/);
  });
});
