import crypto from "node:crypto";
import { eq, ne, desc, isNull, gt, and } from "drizzle-orm";
import { db, users, userPreferences, sessions, auditEvents, organizations, organizationMembers, checkDatabaseConnection } from "../db/index.js";
import {
  type UserProfile,
  type UpdateProfileRequest,
  type UserPreferences,
  type UpdatePreferencesRequest,
  type AccountActivityItem,
  type UserSession,
  type ConnectedServicesResponse,
  type OrganizationDetails,
  type OrganizationMember,
  type InviteMemberRequest,
  UserRole,
} from "@warrant/contracts";
import {
  hashPassword,
  verifyPassword,
  getInMemoryUserById,
  getInMemoryUserByEmail,
  updateInMemoryUser,
  inMemorySessions,
  inMemoryActivity,
  recordInMemoryActivity,
  CANONICAL_STARTER_USERS,
} from "./authService.js";
import { logAuditEvent } from "../db/repositories/auditRepository.js";
import { env } from "../config/env.js";

// In-memory preferences fallback store
const inMemoryPreferences = new Map<string, UserPreferences>();

export const DEFAULT_ORGANIZATION = {
  id: "00000000-0000-0000-0000-000000000010",
  name: "Warrant Enterprise HQ",
  slug: "warrant-hq",
};

/**
 * Derives organization role from user's system role.
 */
function resolveOrgRole(role: string): "OWNER" | "ADMIN" | "MEMBER" {
  if (role === UserRole.ADMINISTRATOR) return "OWNER";
  if (role === UserRole.APPROVER) return "ADMIN";
  return "MEMBER";
}

/**
 * Retrieves the full user profile including organization context.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  // 1. Try PostgreSQL if available
  try {
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (dbUser) {
      const starter = CANONICAL_STARTER_USERS.find(
        (u) => u.id === dbUser.id || (dbUser.email && u.email.toLowerCase() === dbUser.email.toLowerCase())
      );
      const effectiveOrgId = dbUser.organizationId || (starter ? DEFAULT_ORGANIZATION.id : null);
      let orgName: string | null = null;
      let orgRole: "OWNER" | "ADMIN" | "MEMBER" | null = null;
      if (effectiveOrgId) {
        try {
          const [dbOrg] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, effectiveOrgId))
            .limit(1);
          orgName = dbOrg?.name || DEFAULT_ORGANIZATION.name;
          const [mem] = await db
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, effectiveOrgId), eq(organizationMembers.userId, dbUser.id)))
            .limit(1);
          orgRole = (mem?.role as "OWNER" | "ADMIN" | "MEMBER") || resolveOrgRole(dbUser.role);
        } catch {
          orgName = DEFAULT_ORGANIZATION.name;
          orgRole = resolveOrgRole(dbUser.role);
        }
      }

      return {
        id: dbUser.id,
        email: dbUser.email || "",
        name: dbUser.name || starter?.name || null,
        role: (dbUser.role as UserRole) || starter?.role || UserRole.REQUESTER,
        avatarUrl: dbUser.avatarUrl || null,
        jobTitle: dbUser.jobTitle || starter?.jobTitle || null,
        department: dbUser.department || starter?.department || null,
        phoneNumber: dbUser.phoneNumber || starter?.phoneNumber || null,
        bio: dbUser.bio || starter?.bio || null,
        organizationId: effectiveOrgId,
        organizationName: orgName,
        organizationRole: orgRole,
        createdAt: dbUser.createdAt instanceof Date ? dbUser.createdAt.toISOString() : String(dbUser.createdAt),
      };
    }
  } catch {
    // Database unreachable; fall back to in-memory store
  }

  // 2. In-memory store fallback
  const memUser = getInMemoryUserById(userId);
  if (!memUser) return null;

  let orgName: string | null = null;
  let orgRole: "OWNER" | "ADMIN" | "MEMBER" | null = null;
  if (memUser.organizationId) {
    orgName = DEFAULT_ORGANIZATION.name;
    const members = inMemoryOrgMembers.get(memUser.organizationId);
    const mem = members?.find((m) => m.userId === memUser.id);
    orgRole = mem?.role || resolveOrgRole(memUser.role);
  }

  return {
    id: memUser.id,
    email: memUser.email,
    name: memUser.name,
    role: memUser.role,
    avatarUrl: memUser.avatarUrl || null,
    jobTitle: memUser.jobTitle || null,
    department: memUser.department || null,
    phoneNumber: memUser.phoneNumber || null,
    bio: memUser.bio || null,
    organizationId: memUser.organizationId || null,
    organizationName: orgName,
    organizationRole: orgRole,
    createdAt: memUser.createdAt instanceof Date ? memUser.createdAt.toISOString() : String(memUser.createdAt),
  };
}

/**
 * Updates user profile details safely.
 * Role, ID, and Email cannot be modified via this method (prevents privilege escalation).
 */
export async function updateUserProfile(
  userId: string,
  updates: UpdateProfileRequest
): Promise<UserProfile> {
  const existing = await getUserProfile(userId);
  if (!existing) {
    throw new Error("USER_NOT_FOUND");
  }

  // Prepare sanitized update fields
  const safeUpdates: Record<string, any> = {};
  if (updates.name !== undefined) safeUpdates.name = updates.name;
  if (updates.avatarUrl !== undefined) safeUpdates.avatarUrl = updates.avatarUrl;
  if (updates.jobTitle !== undefined) safeUpdates.jobTitle = updates.jobTitle;
  if (updates.department !== undefined) safeUpdates.department = updates.department;
  if (updates.phoneNumber !== undefined) safeUpdates.phoneNumber = updates.phoneNumber;
  if (updates.bio !== undefined) safeUpdates.bio = updates.bio;

  // 1. Try DB update
  try {
    await db
      .update(users)
      .set({
        ...safeUpdates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } catch {
    // Non-fatal if DB is offline
  }

  // 2. Always update in-memory store
  updateInMemoryUser(userId, safeUpdates);

  // 3. Log audit event
  try {
    await logAuditEvent(db, {
      ownerId: userId,
      actorType: "USER",
      eventType: "USER_PROFILE_UPDATED",
      entityType: "USER",
      entityId: userId,
      payload: {
        updatedFields: Object.keys(safeUpdates),
      },
    });
  } catch {
    // Record in memory activity log
    const userEvents = inMemoryActivity.get(userId) || [];
    userEvents.unshift({
      id: `act_${Date.now()}`,
      eventType: "USER_PROFILE_UPDATED",
      entityType: "USER",
      entityId: userId,
      actorType: "USER",
      payload: { updatedFields: Object.keys(safeUpdates) },
      createdAt: new Date().toISOString(),
    });
    inMemoryActivity.set(userId, userEvents);
  }

  const updatedProfile = await getUserProfile(userId);
  return updatedProfile!;
}

/**
 * Retrieves user preferences.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  // 1. Try DB
  try {
    const [dbPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (dbPrefs) {
      return {
        theme: (dbPrefs.theme as "system" | "light" | "dark") || "system",
        defaultPolicyId: dbPrefs.defaultPolicyId,
        emailNotifications: dbPrefs.emailNotifications === "true",
      };
    }
  } catch {
    // DB offline fallback
  }

  // 2. Try in-memory
  if (inMemoryPreferences.has(userId)) {
    return inMemoryPreferences.get(userId)!;
  }

  // 3. Default preferences
  const defaultPrefs: UserPreferences = {
    theme: "system",
    defaultPolicyId: "pol_v1_books_hardware",
    emailNotifications: true,
  };
  inMemoryPreferences.set(userId, defaultPrefs);
  return defaultPrefs;
}

/**
 * Updates or persists user preferences.
 */
export async function updateUserPreferences(
  userId: string,
  updates: UpdatePreferencesRequest
): Promise<UserPreferences> {
  const current = await getUserPreferences(userId);
  const updated: UserPreferences = {
    theme: updates.theme ?? current.theme,
    defaultPolicyId: updates.defaultPolicyId !== undefined ? updates.defaultPolicyId : current.defaultPolicyId,
    emailNotifications: updates.emailNotifications !== undefined ? updates.emailNotifications : current.emailNotifications,
  };

  // 1. Try DB
  try {
    const [existing] = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(userPreferences)
        .set({
          theme: updated.theme,
          defaultPolicyId: updated.defaultPolicyId,
          emailNotifications: String(updated.emailNotifications),
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId));
    } else {
      await db.insert(userPreferences).values({
        userId,
        theme: updated.theme,
        defaultPolicyId: updated.defaultPolicyId,
        emailNotifications: String(updated.emailNotifications),
      });
    }
  } catch {
    // Fallback DB offline
  }

  // 2. Update in-memory
  inMemoryPreferences.set(userId, updated);

  // 3. Log audit event
  try {
    await logAuditEvent(db, {
      ownerId: userId,
      actorType: "USER",
      eventType: "USER_PREFERENCES_UPDATED",
      entityType: "USER",
      entityId: userId,
      payload: { theme: updated.theme, emailNotifications: updated.emailNotifications },
    });
  } catch {
    recordInMemoryActivity(userId, {
      eventType: "USER_PREFERENCES_UPDATED",
      entityType: "USER",
      entityId: userId,
      actorType: "USER",
      payload: { theme: updated.theme },
    });
  }

  return updated;
}

/**
 * Changes a user's password securely with scrypt validation.
 * Enforces security policy: revokes all other active sessions for the user,
 * while preserving the caller's current session token if provided.
 */
export async function changeUserPassword(
  userId: string,
  currentPass: string,
  newPass: string,
  currentTokenHash?: string
): Promise<void> {
  // 1. Retrieve current user password hash
  let storedHash: string | null = null;
  try {
    const [dbUser] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (dbUser?.passwordHash) {
      storedHash = dbUser.passwordHash;
    }
  } catch {
    // Fall back to in-memory
  }

  if (!storedHash) {
    const memUser = getInMemoryUserById(userId);
    if (memUser) {
      storedHash = memUser.passwordHash;
    }
  }

  if (!storedHash) {
    throw new Error("USER_NOT_FOUND");
  }

  // 2. Timing-safe verification
  const isValid = await verifyPassword(currentPass, storedHash);
  if (!isValid) {
    throw new Error("INVALID_CURRENT_PASSWORD");
  }

  // 3. Hash new password
  const newHash = await hashPassword(newPass);

  // 4. Update in DB and memory
  const now = new Date();
  try {
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  } catch {
    // Non-fatal if DB is in-memory
  }

  updateInMemoryUser(userId, { passwordHash: newHash });

  // 5. Revoke all OTHER active sessions for this user (preserve current session)
  try {
    if (currentTokenHash) {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            ne(sessions.tokenHash, currentTokenHash)
          )
        );
    } else {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt)
          )
        );
    }
  } catch {
    // Non-fatal if DB offline
  }

  for (const [tokenHash, sess] of inMemorySessions.entries()) {
    if (sess.userId === userId && (!currentTokenHash || tokenHash !== currentTokenHash)) {
      sess.revokedAt = now;
    }
  }

  // 6. Log audit event
  try {
    await logAuditEvent(db, {
      ownerId: userId,
      actorType: "USER",
      eventType: "USER_PASSWORD_CHANGED",
      entityType: "USER",
      entityId: userId,
      payload: { success: true, otherSessionsRevoked: true },
    });
  } catch {
    recordInMemoryActivity(userId, {
      eventType: "USER_PASSWORD_CHANGED",
      entityType: "USER",
      entityId: userId,
      actorType: "USER",
      payload: { success: true, otherSessionsRevoked: true },
    });
  }
}

/**
 * Revokes an active session for the authenticated user by session ID.
 * Strictly verifies ownership: rejects if session does not belong to userId.
 */
export async function revokeUserSession(
  userId: string,
  sessionId: string,
  currentTokenHash?: string
): Promise<{ success: boolean; isCurrent: boolean }> {
  let found = false;
  let isCurrent = false;
  let dbSessionFound = false;
  let dbUpdated = false;
  const now = new Date();

  // 1. Check in PostgreSQL sessions table if available
  try {
    const [dbSess] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (dbSess) {
      dbSessionFound = true;
      if (dbSess.userId !== userId) {
        throw new Error("SESSION_NOT_FOUND");
      }
      if (currentTokenHash && dbSess.tokenHash === currentTokenHash) {
        isCurrent = true;
      }
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, sessionId));

      dbUpdated = true;
      found = true;

      const memSess = inMemorySessions.get(dbSess.tokenHash);
      if (memSess) {
        memSess.revokedAt = now;
      }
    }
  } catch (err: any) {
    if (err?.message === "SESSION_NOT_FOUND") {
      throw err;
    }
    // Fail fast if authoritative database update failed on a confirmed existing session
    if (dbSessionFound && !dbUpdated) {
      throw new Error("REVOCATION_WRITE_FAILED");
    }
    // Otherwise database is offline/unreachable; fall back to in-memory store
  }

  // 2. Check in-memory sessions
  if (!found) {
    for (const [tokenHash, sess] of inMemorySessions.entries()) {
      if (sess.id === sessionId) {
        if (sess.userId !== userId) {
          throw new Error("SESSION_NOT_FOUND");
        }
        found = true;
        if (currentTokenHash && tokenHash === currentTokenHash) {
          isCurrent = true;
        }
        sess.revokedAt = now;
        break;
      }
    }
  }

  if (!found) {
    throw new Error("SESSION_NOT_FOUND");
  }

  // 3. Log audit event
  try {
    await logAuditEvent(db, {
      ownerId: userId,
      actorType: "USER",
      eventType: "USER_LOGGED_OUT",
      entityType: "USER",
      entityId: userId,
      payload: { sessionId, isCurrent, action: "SESSION_REVOKED" },
    });
  } catch {
    recordInMemoryActivity(userId, {
      eventType: "USER_LOGGED_OUT",
      entityType: "USER",
      entityId: userId,
      actorType: "USER",
      payload: { sessionId, isCurrent, action: "SESSION_REVOKED" },
    });
  }

  return { success: true, isCurrent };
}

/**
 * Returns security and account activity for a user.
 * Truthful reporting: returns actual audit events or empty array; never fabricates demo logs.
 */
export async function getUserActivity(userId: string): Promise<AccountActivityItem[]> {
  try {
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.ownerId, userId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(20);

    if (events.length > 0) {
      return events.map((ev) => ({
        id: ev.id,
        eventType: ev.eventType,
        entityType: ev.entityType,
        entityId: ev.entityId,
        actorType: ev.actorType,
        payload: (ev.payload as Record<string, any>) || {},
        createdAt: ev.createdAt instanceof Date ? ev.createdAt.toISOString() : String(ev.createdAt),
      }));
    }
  } catch {
    // Fall back to in-memory
  }

  const memEvents = inMemoryActivity.get(userId) || [];
  return memEvents;
}

/**
 * Returns active sessions for the current user.
 * Truthful reporting: returns real authenticated sessions or empty array; never injects fake placeholders.
 */
export async function getUserSessions(userId: string, currentTokenHash?: string): Promise<UserSession[]> {
  try {
    const active = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(10);

    if (active.length > 0) {
      return active.map((s) => ({
        id: s.id,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
        expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : String(s.expiresAt),
        isCurrent: Boolean(currentTokenHash && s.tokenHash === currentTokenHash),
      }));
    }
  } catch {
    // Fall back to in-memory
  }

  // In-memory sessions
  const result: UserSession[] = [];
  for (const [tokenHash, s] of inMemorySessions.entries()) {
    if (s.userId === userId && !s.revokedAt && s.expiresAt > new Date()) {
      result.push({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        isCurrent: Boolean(currentTokenHash && tokenHash === currentTokenHash),
      });
    }
  }

  return result;
}

/**
 * Returns live connected services and integration status.
 */
export async function getConnectedServicesStatus(): Promise<ConnectedServicesResponse> {
  const dbStatus = await checkDatabaseConnection();

  return {
    paypal: {
      status: env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET ? "CONNECTED" : "DEGRADED",
      environment: env.PAYPAL_ENV === "sandbox" ? "SANDBOX" : "LIVE",
      ordersV2Available: true,
      reconciliationAvailable: true,
      webhookConfigured: Boolean(env.PAYPAL_WEBHOOK_ID),
    },
    gemini: {
      status: process.env.GEMINI_API_KEY ? "CONNECTED" : "UNCONFIGURED",
      model: "gemini-2.0-flash",
      mandateCompilationAvailable: Boolean(process.env.GEMINI_API_KEY),
    },
    database: {
      configured: Boolean(env.DATABASE_URL),
      connected: dbStatus.connected,
      latencyMs: dbStatus.latencyMs,
    },
  };
}

interface InMemoryOrgMember {
  id: string;
  organizationId: string;
  userId: string;
  name: string | null;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
}

const inMemoryOrgMembers = new Map<string, InMemoryOrgMember[]>();

function ensureDefaultOrgMembers(orgId: string, currentProfile?: UserProfile | null): InMemoryOrgMember[] {
  let list = inMemoryOrgMembers.get(orgId);
  if (!list) {
    list = [
      {
        id: "00000000-0000-0000-0000-000000000101",
        organizationId: orgId,
        userId: "00000000-0000-0000-0000-000000000001",
        name: "System Administrator",
        email: "admin@warrant.studio",
        role: "OWNER",
        createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: "00000000-0000-0000-0000-000000000102",
        organizationId: orgId,
        userId: "00000000-0000-0000-0000-000000000002",
        name: "Department Approver",
        email: "approver@warrant.studio",
        role: "ADMIN",
        createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: "00000000-0000-0000-0000-000000000103",
        organizationId: orgId,
        userId: "00000000-0000-0000-0000-000000000003",
        name: "Finance Auditor",
        email: "auditor@warrant.studio",
        role: "MEMBER",
        createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      },
    ];
    inMemoryOrgMembers.set(orgId, list);
  }

  // Ensure current user is present if they belong to this org
  if (
    currentProfile &&
    currentProfile.organizationId === orgId &&
    !list.some((m) => m.userId === currentProfile.id || m.email.toLowerCase() === currentProfile.email.toLowerCase())
  ) {
    list.unshift({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: currentProfile.id,
      name: currentProfile.name || null,
      email: currentProfile.email,
      role: (currentProfile.organizationRole as "OWNER" | "ADMIN" | "MEMBER") || "MEMBER",
      createdAt: currentProfile.createdAt,
    });
  }

  return list;
}

/**
 * Retrieves the full organization details and active personnel list.
 * Returns null if the user does not belong to any organization.
 */
export async function getOrganizationDetails(userId: string): Promise<OrganizationDetails | null> {
  const profile = await getUserProfile(userId);
  if (!profile || !profile.organizationId) {
    return null;
  }

  const orgId = profile.organizationId;
  const orgName = profile.organizationName || DEFAULT_ORGANIZATION.name;
  const orgRole = (profile.organizationRole as "OWNER" | "ADMIN" | "MEMBER") || "MEMBER";

  // 1. Try PostgreSQL if available
  try {
    const [dbOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (dbOrg) {
      const dbMembers = await db
        .select({
          id: organizationMembers.id,
          userId: organizationMembers.userId,
          role: organizationMembers.role,
          createdAt: organizationMembers.createdAt,
          name: users.name,
          email: users.email,
        })
        .from(organizationMembers)
        .leftJoin(users, eq(organizationMembers.userId, users.id))
        .where(eq(organizationMembers.organizationId, orgId));

      return {
        id: dbOrg.id,
        name: dbOrg.name,
        slug: dbOrg.slug,
        membershipRole: orgRole,
        createdAt: dbOrg.createdAt instanceof Date ? dbOrg.createdAt.toISOString() : String(dbOrg.createdAt),
        members: dbMembers.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.name ?? null,
          email: m.email ?? "unknown@warrant.studio",
          role: (m.role as "OWNER" | "ADMIN" | "MEMBER") || "MEMBER",
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        })),
      };
    }
  } catch {
    // Database unreachable; fall back to in-memory store
  }

  // 2. In-memory fallback
  const members = ensureDefaultOrgMembers(orgId, profile);
  return {
    id: orgId,
    name: orgName,
    slug: DEFAULT_ORGANIZATION.slug,
    membershipRole: orgRole,
    createdAt: new Date().toISOString(),
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * Adds an existing registered colleague to the caller's workspace.
 * Enforces server-side authorization: only OWNER and ADMIN can add members.
 * Requires the target user to already exist in the system (no fabricated users).
 */
export async function inviteOrganizationMember(
  userId: string,
  data: InviteMemberRequest
): Promise<OrganizationMember> {
  const profile = await getUserProfile(userId);
  if (!profile) {
    const error: any = new Error("User profile not found");
    error.statusCode = 404;
    error.code = "PROFILE_NOT_FOUND";
    throw error;
  }

  if (!profile.organizationId) {
    const error: any = new Error("Authenticated user does not belong to any organization.");
    error.statusCode = 400;
    error.code = "NO_ORGANIZATION";
    throw error;
  }

  const callerOrgRole = profile.organizationRole || "MEMBER";
  if (callerOrgRole !== "OWNER" && callerOrgRole !== "ADMIN") {
    const error: any = new Error("Only organization owners and administrators can add members.");
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  // Ensure clients cannot assign OWNER or escalate beyond supported roles
  if ((data.role as string) === "OWNER") {
    const error: any = new Error("Cannot assign OWNER role. Workspaces have a single immutable owner.");
    error.statusCode = 400;
    error.code = "INVALID_ROLE";
    throw error;
  }

  const orgId = profile.organizationId;
  const targetEmail = data.email.trim().toLowerCase();

  // Find target user in PostgreSQL or memory
  let targetUser: { id: string; email: string | null; name: string | null; organizationId: string | null } | null = null;

  try {
    const [dbTarget] = await db
      .select({ id: users.id, email: users.email, name: users.name, organizationId: users.organizationId })
      .from(users)
      .where(eq(users.email, targetEmail))
      .limit(1);

    if (dbTarget) {
      targetUser = dbTarget;
    }
  } catch {
    // Database unreachable; fallback to in-memory store
  }

  if (!targetUser) {
    const memTarget = getInMemoryUserByEmail(targetEmail);
    if (memTarget) {
      targetUser = {
        id: memTarget.id,
        email: memTarget.email,
        name: memTarget.name,
        organizationId: memTarget.organizationId || null,
      };
    }
  }

  if (!targetUser) {
    const error: any = new Error(`No registered user found with email '${data.email}'. Colleagues must create a Warrant Studio account before joining a workspace.`);
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  // Prevent cross-tenant multi-org collisions
  if (targetUser.organizationId && targetUser.organizationId !== orgId) {
    const error: any = new Error("User is already assigned to a different organization.");
    error.statusCode = 409;
    error.code = "ALREADY_IN_ANOTHER_ORG";
    throw error;
  }

  // 1. Try PostgreSQL duplicate checks & insert
  try {
    const [existingMember] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUser.id)))
      .limit(1);

    if (existingMember) {
      const error: any = new Error("User is already a member of this organization.");
      error.statusCode = 409;
      error.code = "MEMBER_EXISTS";
      throw error;
    }
  } catch (err: any) {
    if (err.statusCode) throw err;
  }

  // In-memory duplicate check
  const currentMembers = ensureDefaultOrgMembers(orgId, profile);
  if (currentMembers.some((m) => m.userId === targetUser!.id || m.email.toLowerCase() === targetEmail)) {
    const error: any = new Error("User is already a member of this organization.");
    error.statusCode = 409;
    error.code = "MEMBER_EXISTS";
    throw error;
  }

  const memberId = crypto.randomUUID();
  const now = new Date();

  // Try PostgreSQL write
  try {
    await db.insert(organizationMembers).values({
      id: memberId,
      organizationId: orgId,
      userId: targetUser.id,
      role: data.role,
      createdAt: now,
    });
    await db.update(users).set({ organizationId: orgId, updatedAt: now }).where(eq(users.id, targetUser.id));
  } catch (err: any) {
    if (err?.code === "23505") {
      const error: any = new Error("User is already a member of this organization.");
      error.statusCode = 409;
      error.code = "MEMBER_EXISTS";
      throw error;
    }
  }

  // Always update in-memory
  const newMember: InMemoryOrgMember = {
    id: memberId,
    organizationId: orgId,
    userId: targetUser.id,
    name: targetUser.name || data.name || null,
    email: targetUser.email || targetEmail,
    role: data.role,
    createdAt: now.toISOString(),
  };

  currentMembers.push(newMember);
  updateInMemoryUser(targetUser.id, { organizationId: orgId });

  // Authoritative Audit Log: Logged only on success
  try {
    await logAuditEvent(db, {
      ownerId: userId,
      actorType: "USER",
      eventType: "ORGANIZATION_MEMBER_ADDED",
      entityType: "ORGANIZATION_MEMBER",
      entityId: memberId,
      payload: {
        organizationId: orgId,
        targetUserId: targetUser.id,
        targetEmail: targetUser.email || targetEmail,
        role: data.role,
      },
    });
  } catch {
    recordInMemoryActivity(userId, {
      eventType: "ORGANIZATION_MEMBER_ADDED",
      entityType: "ORGANIZATION_MEMBER",
      entityId: memberId,
      actorType: "USER",
      payload: {
        organizationId: orgId,
        targetUserId: targetUser.id,
        targetEmail: targetUser.email || targetEmail,
        role: data.role,
      },
    });
  }

  return {
    id: newMember.id,
    userId: newMember.userId,
    name: newMember.name,
    email: newMember.email,
    role: newMember.role,
    createdAt: newMember.createdAt,
  };
}

export const addOrganizationMember = inviteOrganizationMember;
