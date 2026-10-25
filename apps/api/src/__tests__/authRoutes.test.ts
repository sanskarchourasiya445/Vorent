import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import { UserRole } from "@warrant/contracts";

describe("Authentication & Authorization Routes (Master Brief Section 7)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer({});
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Public Registration (POST /api/auth/register)", () => {
    it("successfully registers a new user with least-privileged REQUESTER role", async () => {
      const uniqueEmail = `test.user.${Date.now()}@example.com`;
      const res = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: uniqueEmail,
          password: "SuperSecretPassword123!",
          name: "Test Requester",
          // Attempt privilege escalation: client tries to request ADMINISTRATOR
          role: "ADMINISTRATOR",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.token).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(uniqueEmail.toLowerCase());
      expect(body.user.name).toBe("Test Requester");
      // MASTER BRIEF SECTION 7.2: Server unconditionally assigns least-privileged REQUESTER role
      expect(body.user.role).toBe(UserRole.REQUESTER);
      expect(body.expiresAt).toBeDefined();
    });

    it("rejects duplicate email registration with 409 Conflict", async () => {
      const email = `duplicate.${Date.now()}@example.com`;
      // First registration
      await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email,
          password: "Password123!",
          name: "First",
        },
      });

      // Second registration with same email
      const res = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email,
          password: "AnotherPassword123!",
          name: "Second",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    });

    it("rejects registration with short password (< 8 chars)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "shortpass@example.com",
          password: "short",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Login (POST /api/auth/login)", () => {
    it("successfully logs in with valid starter persona credentials (admin)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "admin@warrant.studio",
          password: "AdminPass123!",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe("admin@warrant.studio");
      expect(body.user.role).toBe(UserRole.ADMINISTRATOR);
    });

    it("successfully logs in with valid starter persona credentials (approver)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "approver@warrant.studio",
          password: "ApproverPass123!",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.token).toBeDefined();
      expect(body.user.role).toBe(UserRole.APPROVER);
    });

    it("rejects invalid password with 401 and generic message (mitigates enumeration)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "admin@warrant.studio",
          password: "WrongPassword!",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
      expect(body.error.message).toBe("Invalid email or password.");
    });

    it("rejects non-existent email with 401 and same generic message", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "nobody_exists@warrant.studio",
          password: "SomePassword123!",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
      expect(body.error.message).toBe("Invalid email or password.");
    });
  });

  describe("Session Validation & Current User (GET /api/auth/me)", () => {
    it("returns 401 UNAUTHENTICATED when called without Authorization header", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/auth/me",
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("UNAUTHENTICATED");
    });

    it("returns 401 UNAUTHENTICATED when called with forged/invalid token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: "Bearer invalid_forged_token_1234567890",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("UNAUTHENTICATED");
    });

    it("returns user profile when called with valid session token", async () => {
      // 1. Log in
      const loginRes = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "requester@warrant.studio",
          password: "RequesterPass123!",
        },
      });
      const { token, user } = loginRes.json();

      // 2. Query /api/auth/me
      const meRes = await server.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(meRes.statusCode).toBe(200);
      const meBody = meRes.json();
      expect(meBody.user.id).toBe(user.id);
      expect(meBody.user.email).toBe("requester@warrant.studio");
      expect(meBody.user.role).toBe(UserRole.REQUESTER);
    });
  });

  describe("Logout & Session Revocation (POST /api/auth/logout)", () => {
    it("revokes active session token and forbids subsequent /me calls", async () => {
      // 1. Log in
      const loginRes = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "auditor@warrant.studio",
          password: "AuditorPass123!",
        },
      });
      const { token } = loginRes.json();

      // 2. Verify token works
      const beforeLogout = await server.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(beforeLogout.statusCode).toBe(200);

      // 3. Logout
      const logoutRes = await server.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.json().success).toBe(true);

      // 4. Token is now revoked
      const afterLogout = await server.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(afterLogout.statusCode).toBe(401);
    });
  });

  describe("Personas Endpoint (GET /api/auth/personas)", () => {
    it("returns starter personas covering all four Master Brief roles", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/auth/personas",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.personas.length).toBe(4);
      const roles = body.personas.map((p: any) => p.role);
      expect(roles).toContain(UserRole.ADMINISTRATOR);
      expect(roles).toContain(UserRole.APPROVER);
      expect(roles).toContain(UserRole.FINANCE_AUDITOR);
      expect(roles).toContain(UserRole.REQUESTER);
    });
  });
});
