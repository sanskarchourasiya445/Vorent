import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  logAuditEvent,
  listAuditEvents,
  redactSensitiveAuditPayload,
} from "../db/repositories/auditRepository.js";

describe("auditRepository", () => {
  function createMockAuditDb() {
    const store: any[] = [];
    return {
      _store: store,
      insert: vi.fn().mockImplementation((_table: any) => ({
        values: vi.fn().mockImplementation(async (record: any) => {
          store.push(record);
          return [record];
        }),
      })),
      select: vi.fn().mockImplementation((_fields?: any) => {
        let filtered = [...store];
        const builder: any = {
          from: vi.fn().mockImplementation((_table: any) => builder),
          where: vi.fn().mockImplementation((_condition: any) => {
            return builder;
          }),
          orderBy: vi.fn().mockImplementation(() => builder),
          limit: vi.fn().mockImplementation((n: number) => {
            filtered = filtered.slice(0, n);
            return builder;
          }),
          offset: vi.fn().mockImplementation((n: number) => {
            filtered = filtered.slice(n);
            return filtered;
          }),
          then: (resolve: any) => resolve(filtered),
        };
        return builder;
      }),
    };
  }

  describe("redactSensitiveAuditPayload", () => {
    it("recursively redacts sensitive patterns", () => {
      const payload = {
        name: "Test proposal",
        client_secret: "super-secret-value",
        cookie: "session_id=abcdef123456",
        nested: {
          access_token: "bearer-token-12345",
          password: "my-password",
          safeField: 42,
          array: [{ apiKey: "abcde", label: "allowed" }],
        },
      };

      const redacted = redactSensitiveAuditPayload(payload) as any;
      expect(redacted.name).toBe("Test proposal");
      expect(redacted.client_secret).toBe("[REDACTED]");
      expect(redacted.cookie).toBe("[REDACTED]");
      expect(redacted.nested.access_token).toBe("[REDACTED]");
      expect(redacted.nested.password).toBe("[REDACTED]");
      expect(redacted.nested.safeField).toBe(42);
      expect(redacted.nested.array[0].apiKey).toBe("[REDACTED]");
      expect(redacted.nested.array[0].label).toBe("allowed");
    });

    it("verifies redaction boundary: property-key based, leaving free-text values intact", () => {
      const payload = {
        auditNote: "User entered invalid password format during checkout",
        systemMessage: "Bearer token expired at 12:00 UTC",
      };

      const redacted = redactSensitiveAuditPayload(payload) as any;
      // Key-based redaction: because 'auditNote' and 'systemMessage' do not match sensitive key patterns,
      // free-text strings are preserved. This establishes the documented boundary.
      expect(redacted.auditNote).toBe("User entered invalid password format during checkout");
      expect(redacted.systemMessage).toBe("Bearer token expired at 12:00 UTC");
    });
  });

  describe("logAuditEvent", () => {
    it("appends audit record with UUID, timestamp, and redacted payload", async () => {
      const mockDb = createMockAuditDb();
      const entityId = randomUUID();
      const ownerId = randomUUID();

      const record = await logAuditEvent(mockDb as any, {
        ownerId,
        actorType: "USER",
        eventType: "POLICY_CREATED",
        entityType: "POLICY",
        entityId,
        payload: {
          title: "Safe Office Purchases",
          secretToken: "must-be-redacted",
        },
      });

      expect(record.id).toBeDefined();
      expect(record.ownerId).toBe(ownerId);
      expect(record.actorType).toBe("USER");
      expect(record.eventType).toBe("POLICY_CREATED");
      expect(record.entityType).toBe("POLICY");
      expect(record.entityId).toBe(entityId);
      expect(record.payload.secretToken).toBe("[REDACTED]");
      expect(record.payload.title).toBe("Safe Office Purchases");
      expect(record.createdAt).toBeDefined();

      expect(mockDb._store).toHaveLength(1);
    });

    it("stores non-UUID entityId in payload to avoid database type violations", async () => {
      const mockDb = createMockAuditDb();

      const record = await logAuditEvent(mockDb as any, {
        actorType: "SYSTEM",
        eventType: "POLICY_CREATED",
        entityType: "POLICY",
        entityId: "preset_office_supplies",
        payload: { preset: true },
      });

      expect(record.entityId).toBeNull();
      expect(record.payload.originalEntityId).toBe("preset_office_supplies");
    });
  });

  describe("listAuditEvents", () => {
    it("queries audit events and maps output according to contract", async () => {
      const mockDb = createMockAuditDb();
      mockDb._store.push({
        id: randomUUID(),
        ownerId: randomUUID(),
        actorType: "SYSTEM",
        eventType: "CHECKOUT_PROPOSAL_EVALUATED",
        entityType: "CHECKOUT_PROPOSAL",
        entityId: randomUUID(),
        payload: { decision: "ALLOW" },
        createdAt: new Date(),
      });

      const result = await listAuditEvents(mockDb as any, { limit: 10 });
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.events[0]?.eventType).toBe("CHECKOUT_PROPOSAL_EVALUATED");
    });
  });

  describe("Immutability Boundary", () => {
    it("strictly prevents modification or deletion - repository exports no update/delete methods", async () => {
      const repo = await import("../db/repositories/auditRepository.js");
      expect((repo as any).updateAuditEvent).toBeUndefined();
      expect((repo as any).deleteAuditEvent).toBeUndefined();
      expect((repo as any).modifyAuditEvent).toBeUndefined();
      expect((repo as any).purgeAuditEvents).toBeUndefined();
      expect(typeof repo.logAuditEvent).toBe("function");
      expect(typeof repo.listAuditEvents).toBe("function");
    });
  });
});
