import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import { UserRole } from "@warrant/contracts";
import { resetRateLimits } from "../routes/routeUtils.js";

describe("Account Hub, User Profiles & Settings Routes", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let requesterToken: string;
  let testUserEmail: string;
  let testUserToken: string;

  beforeAll(async () => {
    server = await buildServer({});
    await server.ready();

    // Log in as canonical Admin
    const adminLoginRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@warrant.studio",
        password: "AdminPass123!",
      },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    adminToken = adminLoginRes.json().token;

    // Log in as canonical Requester
    const requesterLoginRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "requester@warrant.studio",
        password: "RequesterPass123!",
      },
    });
    expect(requesterLoginRes.statusCode).toBe(200);
    requesterToken = requesterLoginRes.json().token;

    // Register a dedicated test user for password change & profile tests
    testUserEmail = `profile.test.${Date.now()}@warrant.studio`;
    const regRes = await server.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: testUserEmail,
        password: "InitialPassword123!",
        name: "Profile Test Subject",
      },
    });
    expect(regRes.statusCode).toBe(201);
    testUserToken = regRes.json().token;
  }, 30000);

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  describe("1. Profile Management (GET & PATCH /api/account/profile)", () => {
    it("rejects unauthenticated request with HTTP 401 on all protected endpoints", async () => {
      const endpoints: Array<{ method: "GET" | "PATCH" | "POST" | "DELETE"; url: string; payload?: any }> = [
        { method: "GET", url: "/api/account/profile" },
        { method: "PATCH", url: "/api/account/profile", payload: { name: "Hacker" } },
        { method: "GET", url: "/api/account/preferences" },
        { method: "PATCH", url: "/api/account/preferences", payload: { theme: "dark" } },
        { method: "POST", url: "/api/account/change-password", payload: { currentPassword: "foo", newPassword: "bar123456" } },
        { method: "GET", url: "/api/account/activity" },
        { method: "GET", url: "/api/account/sessions" },
        { method: "DELETE", url: "/api/account/sessions/00000000-0000-0000-0000-000000000000" },
      ];

      for (const ep of endpoints) {
        const res = await server.inject({
          method: ep.method,
          url: ep.url,
          payload: ep.payload,
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe("UNAUTHENTICATED");
      }
    });

    it("retrieves current authenticated profile with role and organization context", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const { profile } = res.json();
      expect(profile).toBeDefined();
      expect(profile.email).toBe("admin@warrant.studio");
      expect(profile.name).toBe("System Administrator");
      expect(profile.role).toBe(UserRole.ADMINISTRATOR);
      expect(profile.organizationName).toBe("Warrant Enterprise HQ");
      expect(profile.organizationRole).toBe("OWNER");
      expect(profile.jobTitle).toBe("Lead Security Architect");
      expect(profile.department).toBe("InfoSec & Governance");
    });

    it("updates user profile fields safely", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/account/profile",
        headers: {
          authorization: `Bearer ${testUserToken}`,
        },
        payload: {
          name: "Updated Full Name",
          jobTitle: "Senior Verification Engineer",
          department: "Security Assurance",
          phoneNumber: "+1 (555) 999-0001",
          bio: "Specializing in bounded model-checking and fail-closed gate evaluation.",
        },
      });

      expect(res.statusCode).toBe(200);
      const { profile } = res.json();
      expect(profile.name).toBe("Updated Full Name");
      expect(profile.jobTitle).toBe("Senior Verification Engineer");
      expect(profile.department).toBe("Security Assurance");
      expect(profile.phoneNumber).toBe("+1 (555) 999-0001");
      expect(profile.bio).toContain("bounded model-checking");

      // Verify that role was NOT escalated and remains REQUESTER
      expect(profile.role).toBe(UserRole.REQUESTER);
    });

    it("rejects attempt to escalate privileges or update invalid fields via profile patch", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/account/profile",
        headers: {
          authorization: `Bearer ${requesterToken}`,
        },
        payload: {
          name: "Attacker Trying Privilege Escalation",
          role: "ADMINISTRATOR", // Unsupported field in schema
        },
      });

      // Role is ignored or stripped by Zod; user's role must remain REQUESTER
      expect(res.statusCode).toBe(200);
      const verifyRes = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: {
          authorization: `Bearer ${requesterToken}`,
        },
      });
      expect(verifyRes.json().profile.role).toBe(UserRole.REQUESTER);
    });
  });

  describe("2. Preferences Management (GET & PATCH /api/account/preferences)", () => {
    it("retrieves baseline preferences", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/account/preferences",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const { preferences } = res.json();
      expect(preferences).toBeDefined();
      expect(["system", "light", "dark"]).toContain(preferences.theme);
      expect(typeof preferences.emailNotifications).toBe("boolean");
    });

    it("updates and persists theme and notification preferences", async () => {
      const patchRes = await server.inject({
        method: "PATCH",
        url: "/api/account/preferences",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          theme: "light",
          emailNotifications: false,
          defaultPolicyId: "pol_v1_books_hardware",
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const { preferences } = patchRes.json();
      expect(preferences.theme).toBe("light");
      expect(preferences.emailNotifications).toBe(false);
      expect(preferences.defaultPolicyId).toBe("pol_v1_books_hardware");

      // Verify persistence on subsequent GET
      const getRes = await server.inject({
        method: "GET",
        url: "/api/account/preferences",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(getRes.json().preferences.theme).toBe("light");
      expect(getRes.json().preferences.emailNotifications).toBe(false);
    });

    it("rejects invalid theme options with validation error", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/api/account/preferences",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          theme: "invalid_neon_pink_theme",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("3. Security & Password Change (POST /api/account/change-password)", () => {
    it("rejects password change if current password is incorrect", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/account/change-password",
        headers: {
          authorization: `Bearer ${testUserToken}`,
        },
        payload: {
          currentPassword: "WrongPassword999!",
          newPassword: "BrandNewPassword123!",
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("INVALID_CURRENT_PASSWORD");
    });

    it("rejects new password that is shorter than 8 characters", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/account/change-password",
        headers: {
          authorization: `Bearer ${testUserToken}`,
        },
        payload: {
          currentPassword: "InitialPassword123!",
          newPassword: "short",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("successfully changes password and permits login with the new password", async () => {
      const changeRes = await server.inject({
        method: "POST",
        url: "/api/account/change-password",
        headers: {
          authorization: `Bearer ${testUserToken}`,
        },
        payload: {
          currentPassword: "InitialPassword123!",
          newPassword: "BrandNewSecurePassword123!",
        },
      });

      expect(changeRes.statusCode).toBe(200);
      expect(changeRes.json().success).toBe(true);

      // Verify login with old password fails
      const oldLoginRes = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: testUserEmail,
          password: "InitialPassword123!",
        },
      });
      expect(oldLoginRes.statusCode).toBe(401);

      // Verify login with new password succeeds
      const newLoginRes = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: testUserEmail,
          password: "BrandNewSecurePassword123!",
        },
      });
      expect(newLoginRes.statusCode).toBe(200);
      expect(newLoginRes.json().token).toBeDefined();
    });
  });

  describe("4. Account Activity & Sessions (GET /api/account/activity & /sessions)", () => {
    it("returns activity events log for user", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/account/activity",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const { activity } = res.json();
      expect(Array.isArray(activity)).toBe(true);
      expect(activity.length).toBeGreaterThan(0);
      expect(activity[0].eventType).toBeDefined();
      expect(activity[0].createdAt).toBeDefined();
    });

    it("returns active sessions list with current indicator", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/account/sessions",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const { sessions } = res.json();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].expiresAt).toBeDefined();
    });
  });

  describe("5. Connected Services & Integrations (GET /api/account/integrations)", () => {
    it("returns accurate environment and integration status", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/account/integrations",
      });

      expect(res.statusCode).toBe(200);
      const { integrations } = res.json();
      expect(integrations).toBeDefined();

      // PayPal Sandbox Environment
      expect(integrations.paypal).toBeDefined();
      expect(integrations.paypal.environment).toBe("SANDBOX");
      expect(typeof integrations.paypal.ordersV2Available).toBe("boolean");

      // Gemini LLM Assistant
      expect(integrations.gemini).toBeDefined();
      expect(integrations.gemini.model).toBe("gemini-2.0-flash");

      // Database
      expect(integrations.database).toBeDefined();
      expect(typeof integrations.database.configured).toBe("boolean");
    });
  });

  describe("6. User & Tenant Data Isolation (Cross-User Segregation)", () => {
    it("ensures User A preference updates do not affect User B", async () => {
      // User A (testUserToken) sets theme to dark
      const updateResA = await server.inject({
        method: "PATCH",
        url: "/api/account/preferences",
        headers: { authorization: `Bearer ${testUserToken}` },
        payload: { theme: "dark" },
      });
      expect(updateResA.statusCode).toBe(200);
      expect(updateResA.json().preferences.theme).toBe("dark");

      // User B (requesterToken) reads their preferences; should NOT be dark
      const getResB = await server.inject({
        method: "GET",
        url: "/api/account/preferences",
        headers: { authorization: `Bearer ${requesterToken}` },
      });
      expect(getResB.statusCode).toBe(200);
      expect(getResB.json().preferences.theme).not.toBe("dark");
    });

    it("ensures profiles are strictly scoped to the authenticated caller's identity", async () => {
      const profileA = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${testUserToken}` },
      });
      const profileB = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(profileA.statusCode).toBe(200);
      expect(profileB.statusCode).toBe(200);
      expect(profileA.json().profile.id).not.toBe(profileB.json().profile.id);
      expect(profileA.json().profile.email).not.toBe(profileB.json().profile.email);
    });

    it("verifies account endpoints ignore spoofed userId in query or body parameters", async () => {
      // Attacker attempts to update another user's profile by injecting target userId
      const spoofRes = await server.inject({
        method: "PATCH",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          name: "Spoofed Requester Name",
          id: "00000000-0000-0000-0000-000000000001", // Admin's UUID
        },
      });
      expect(spoofRes.statusCode).toBe(200);

      // Verify Admin's profile was NOT modified
      const adminProfile = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(adminProfile.json().profile.name).toBe("System Administrator");
    });
  });

  describe("7. Session Lifecycle & Revocation Verification", () => {
    it("revoking session via logout terminates access to all /api/account endpoints", async () => {
      // 1. Register a temporary user
      const tempEmail = `temp.session.${Date.now()}@warrant.studio`;
      const reg = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: tempEmail,
          password: "TempPassword123!",
          name: "Temp Session User",
        },
      });
      expect(reg.statusCode).toBe(201);
      const tempToken = reg.json().token;

      // 2. Verify account access works with token
      const accessBefore = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${tempToken}` },
      });
      expect(accessBefore.statusCode).toBe(200);

      // 3. Logout to revoke session
      const logoutRes = await server.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${tempToken}` },
      });
      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.json().success).toBe(true);

      // 4. Verify token is now completely rejected on account endpoints
      const accessAfter = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${tempToken}` },
      });
      expect(accessAfter.statusCode).toBe(401);
      expect(accessAfter.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("documents security boundary: password change preserves active session token until logout", async () => {
      // Register a dedicated user
      const dedicatedEmail = `pwd.session.${Date.now()}@warrant.studio`;
      const reg = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: dedicatedEmail,
          password: "OriginalPassword123!",
          name: "Password Session User",
        },
      });
      const userToken = reg.json().token;

      // Change password
      const changeRes = await server.inject({
        method: "POST",
        url: "/api/account/change-password",
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          currentPassword: "OriginalPassword123!",
          newPassword: "UpdatedPassword123!",
        },
      });
      expect(changeRes.statusCode).toBe(200);

      // Verify that in the current implementation, existing session token remains active
      const accessWithExistingToken = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${userToken}` },
      });
      // The session is still valid until explicitly logged out
      expect(accessWithExistingToken.statusCode).toBe(200);

      // But login with old password is strictly blocked
      const oldLogin = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: dedicatedEmail, password: "OriginalPassword123!" },
      });
      expect(oldLogin.statusCode).toBe(401);

      // And login with new password succeeds
      const newLogin = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: dedicatedEmail, password: "UpdatedPassword123!" },
      });
      expect(newLogin.statusCode).toBe(200);
    });

    it("password change revokes all other active sessions for the user while preserving current session", async () => {
      // 1. Register user
      const userEmail = `multi.sess.${Date.now()}@warrant.studio`;
      const reg = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: userEmail,
          password: "InitialPassword123!",
          name: "Multi Session User",
        },
      });
      expect(reg.statusCode).toBe(201);
      const tokenSession1 = reg.json().token;

      // 2. Login from second client/browser to create Session 2
      const login2 = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userEmail,
          password: "InitialPassword123!",
        },
      });
      expect(login2.statusCode).toBe(200);
      const tokenSession2 = login2.json().token;

      // Both tokens are initially valid
      const check1 = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${tokenSession1}` },
      });
      expect(check1.statusCode).toBe(200);

      const check2 = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${tokenSession2}` },
      });
      expect(check2.statusCode).toBe(200);

      // 3. Change password using Session 1
      const changeRes = await server.inject({
        method: "POST",
        url: "/api/account/change-password",
        headers: { authorization: `Bearer ${tokenSession1}` },
        payload: {
          currentPassword: "InitialPassword123!",
          newPassword: "NewSecretPassword123!",
        },
      });
      expect(changeRes.statusCode).toBe(200);

      // 4. Session 1 (current caller) MUST remain valid
      const session1After = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${tokenSession1}` },
      });
      expect(session1After.statusCode).toBe(200);

      // 5. Session 2 (other session) MUST be immediately revoked (HTTP 401)
      const session2After = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${tokenSession2}` },
      });
      expect(session2After.statusCode).toBe(401);
      expect(session2After.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("allows authenticated user to explicitly revoke a non-current session via DELETE /api/account/sessions/:id", async () => {
      // 1. Create a user with two sessions
      const userEmail = `revoke.sess.${Date.now()}@warrant.studio`;
      const reg = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: userEmail,
          password: "RevokePassword123!",
          name: "Revoke Session Subject",
        },
      });
      const token1 = reg.json().token;

      const login2 = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: userEmail,
          password: "RevokePassword123!",
        },
      });
      const token2 = login2.json().token;

      // 2. Fetch sessions using Token 1
      const listRes = await server.inject({
        method: "GET",
        url: "/api/account/sessions",
        headers: { authorization: `Bearer ${token1}` },
      });
      expect(listRes.statusCode).toBe(200);
      const { sessions } = listRes.json();
      expect(sessions.length).toBeGreaterThanOrEqual(2);

      // Find non-current session
      const otherSession = sessions.find((s: any) => !s.isCurrent);
      expect(otherSession).toBeDefined();

      // 3. Revoke other session
      const revokeRes = await server.inject({
        method: "DELETE",
        url: `/api/account/sessions/${otherSession.id}`,
        headers: { authorization: `Bearer ${token1}` },
      });
      expect(revokeRes.statusCode).toBe(200);
      expect(revokeRes.json().success).toBe(true);

      // 4. Token 2 must now be rejected with 401
      const token2Check = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${token2}` },
      });
      expect(token2Check.statusCode).toBe(401);

      // 5. Token 1 remains active
      const token1Check = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${token1}` },
      });
      expect(token1Check.statusCode).toBe(200);
    });

    it("strictly prevents cross-user session revocation (User A cannot revoke User B's session)", async () => {
      // User A
      const userAEmail = `user.a.${Date.now()}@warrant.studio`;
      const regA = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: userAEmail, password: "PasswordA123!", name: "User A" },
      });
      const tokenA = regA.json().token;

      // User B
      const userBEmail = `user.b.${Date.now()}@warrant.studio`;
      const regB = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: userBEmail, password: "PasswordB123!", name: "User B" },
      });
      const tokenB = regB.json().token;

      // Get User B's session ID
      const listB = await server.inject({
        method: "GET",
        url: "/api/account/sessions",
        headers: { authorization: `Bearer ${tokenB}` },
      });
      const userBSessionId = listB.json().sessions[0].id;

      // User A attempts to revoke User B's session
      const attackRes = await server.inject({
        method: "DELETE",
        url: `/api/account/sessions/${userBSessionId}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });

      // Must be rejected with 404 (not found / not owned)
      expect(attackRes.statusCode).toBe(404);
      expect(attackRes.json().error.code).toBe("SESSION_NOT_FOUND");
      expect(attackRes.json().error.message).toBe("Session not found or does not belong to the authenticated user.");

      // Anti-enumeration check: non-existent random UUID yields identical status and message
      const randomUuid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      const nonExistentRes = await server.inject({
        method: "DELETE",
        url: `/api/account/sessions/${randomUuid}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(nonExistentRes.statusCode).toBe(404);
      expect(nonExistentRes.json().error.code).toBe("SESSION_NOT_FOUND");
      expect(nonExistentRes.json().error.message).toBe("Session not found or does not belong to the authenticated user.");

      // Verify User B's session was NOT revoked and remains healthy
      const userBCheck = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(userBCheck.statusCode).toBe(200);
      expect(userBCheck.json().profile.email).toBe(userBEmail);
    });

    it("verifies concurrent and repeated requests with a revoked session token are consistently rejected (HTTP 401)", async () => {
      // Register user with session
      const userEmail = `conc.revoke.${Date.now()}@warrant.studio`;
      const reg = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: userEmail, password: "Password123!", name: "Concurrent Subject" },
      });
      const token = reg.json().token;

      // Logout to revoke token
      const logout = await server.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(logout.statusCode).toBe(200);

      // Fire 5 concurrent requests with revoked token
      const concurrentRequests = Array.from({ length: 5 }, () =>
        server.inject({
          method: "GET",
          url: "/api/account/profile",
          headers: { authorization: `Bearer ${token}` },
        })
      );

      const responses = await Promise.all(concurrentRequests);
      for (const res of responses) {
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe("UNAUTHENTICATED");
      }
    });

    it("truthfully reports real account state without fabricated demo records", async () => {
      // Query sessions for User B
      const listRes = await server.inject({
        method: "GET",
        url: "/api/account/sessions",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const { sessions } = listRes.json();

      // Ensure no fake placeholder IDs like "sess_current_browser"
      for (const s of sessions) {
        expect(s.id).not.toBe("sess_current_browser");
        expect(s.createdAt).toBeDefined();
        expect(s.expiresAt).toBeDefined();
      }

      // Query activity for admin
      const actRes = await server.inject({
        method: "GET",
        url: "/api/account/activity",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(actRes.statusCode).toBe(200);
      const { activity } = actRes.json();

      // Ensure no fake demo records like "act_initial_signin" or "act_initial_policy_load"
      for (const act of activity) {
        expect(act.id).not.toBe("act_initial_signin");
        expect(act.id).not.toBe("act_initial_policy_load");
      }
    });
  });

  describe("8. Organization & Workspace Personnel Management", () => {
    it("fetches organization details and active personnel list for authenticated user with organization", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/account/organization",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.organization).toBeDefined();
      expect(body.organization.name).toBe("Warrant Enterprise HQ");
      expect(body.organization.slug).toBe("warrant-hq");
      expect(Array.isArray(body.organization.members)).toBe(true);
      expect(body.organization.members.length).toBeGreaterThan(0);

      // Verify member record schema
      const member = body.organization.members[0];
      expect(member.id).toBeDefined();
      expect(member.userId).toBeDefined();
      expect(member.email).toBeDefined();
      expect(["OWNER", "ADMIN", "MEMBER"]).toContain(member.role);
    });

    it("enforces tenant isolation: users without an organization receive null rather than fallback data", async () => {
      // Register standalone user without organization
      const standaloneEmail = `standalone.${Date.now()}@warrant.studio`;
      const reg = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: standaloneEmail, password: "Password123!", name: "Standalone User" },
      });
      const standaloneToken = reg.json().token;

      // GET /organization must return null
      const res = await server.inject({
        method: "GET",
        url: "/api/account/organization",
        headers: { authorization: `Bearer ${standaloneToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().organization).toBeNull();

      // Standalone user without organization cannot add members
      const addRes = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${standaloneToken}` },
        payload: { email: "someuser@warrant.studio", role: "MEMBER" },
      });
      expect(addRes.statusCode).toBe(400);
      expect(addRes.json().error.code).toBe("NO_ORGANIZATION");
    });

    it("rejects adding non-existent user with HTTP 404 USER_NOT_FOUND (no fabricated users)", async () => {
      const unknownEmail = `nonexistent.${Date.now()}@warrant.studio`;
      const res = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: unknownEmail,
          name: "Ghost User",
          role: "MEMBER",
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("USER_NOT_FOUND");
    });

    it("allows owner/admin to add a registered colleague to the workspace with genuine user identity", async () => {
      // 1. Register colleague user first
      const colleagueEmail = `registered.colleague.${Date.now()}@warrant.studio`;
      const reg = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: colleagueEmail,
          password: "ColleaguePass123!",
          name: "Dr. Evelyn Reed",
        },
      });
      expect(reg.statusCode).toBe(201);
      const registeredUserId = reg.json().user.id;

      // 2. Add colleague to workspace
      const res = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: colleagueEmail,
          name: "Dr. Evelyn Reed",
          role: "ADMIN",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.member).toBeDefined();
      expect(body.member.userId).toBe(registeredUserId); // Genuine user ID, not fabricated
      expect(body.member.email).toBe(colleagueEmail);
      expect(body.member.name).toBe("Dr. Evelyn Reed");
      expect(body.member.role).toBe("ADMIN");

      // 3. Verify the new member appears in organization listing
      const listRes = await server.inject({
        method: "GET",
        url: "/api/account/organization",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const members = listRes.json().organization.members;
      const found = members.find((m: any) => m.email === colleagueEmail);
      expect(found).toBeDefined();
      expect(found.userId).toBe(registeredUserId);

      // 4. Verify audit event was logged
      const activityRes = await server.inject({
        method: "GET",
        url: "/api/account/activity",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const activities = activityRes.json().activity;
      expect(activities.some((a: any) => a.eventType === "ORGANIZATION_MEMBER_ADDED")).toBe(true);
    }, 15000);

    it("rejects duplicate member addition with HTTP 409 MEMBER_EXISTS", async () => {
      // Register colleague
      const dupEmail = `dup.colleague.${Date.now()}@warrant.studio`;
      await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: dupEmail, password: "Password123!", name: "Duplicate Subject" },
      });

      // First add succeeds
      const first = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: dupEmail, role: "MEMBER" },
      });
      expect(first.statusCode).toBe(201);

      // Duplicate add fails
      const second = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: dupEmail, role: "MEMBER" },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("MEMBER_EXISTS");
    }, 15000);

    it("prevents privilege escalation: clients cannot assign OWNER role (HTTP 400)", async () => {
      const targetEmail = `target.owner.${Date.now()}@warrant.studio`;
      await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: targetEmail, password: "Password123!", name: "Target Escalation" },
      });

      const res = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: targetEmail, role: "OWNER" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("validates payload requirements with HTTP 400", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: "not-an-email", role: "MEMBER" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("enforces role authorization: standard MEMBER cannot add new members (HTTP 403)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/account/organization/members",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { email: `target.${Date.now()}@warrant.studio`, role: "MEMBER" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    });
  });
});
