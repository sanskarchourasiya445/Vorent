import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, users, sessions, organizations, organizationMembers } from "../db/index.js";
import { UserRole, type AuthUser, type RegisterRequest, type LoginRequest, type AccountActivityItem } from "@warrant/contracts";
import { logAuditEvent } from "../db/repositories/auditRepository.js";

const scryptAsync = promisify(scrypt);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Synchronous password hash using scrypt + 16-byte cryptographic salt
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

// Timing-safe password verification
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }
    const [, salt, originalKeyHex] = parts;
    const derivedKey = (await scryptAsync(password, salt!, 64)) as Buffer;
    const originalKey = Buffer.from(originalKeyHex!, "hex");
    if (derivedKey.length !== originalKey.length) {
      return false;
    }
    return timingSafeEqual(derivedKey, originalKey);
  } catch {
    return false;
  }
}

// Generate high-entropy 256-bit opaque token and its SHA-256 hash
export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export interface InMemoryUserRecord {
  id: string;
  authSubject: string;
  email: string;
  passwordHash: string;
  name: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  phoneNumber?: string | null;
  bio?: string | null;
  organizationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
}

export interface InMemorySessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

// In-memory identity cache for fast unit tests or standalone execution without external Postgres
export const inMemoryUsers = new Map<string, InMemoryUserRecord>(); // key: id
export const inMemoryUsersByEmail = new Map<string, InMemoryUserRecord>(); // key: lowercase email
export const inMemorySessions = new Map<string, InMemorySessionRecord>(); // key: tokenHash
export const inMemoryActivity = new Map<string, AccountActivityItem[]>(); // key: userId

export function recordInMemoryActivity(
  userId: string,
  event: {
    eventType: string;
    entityType: string;
    entityId: string | null;
    actorType: string;
    payload?: Record<string, any>;
  }
): void {
  const userEvents = inMemoryActivity.get(userId) || [];
  userEvents.unshift({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorType: event.actorType,
    payload: event.payload || {},
    createdAt: new Date().toISOString(),
  });
  inMemoryActivity.set(userId, userEvents);
}

export function getInMemoryUserById(id: string): InMemoryUserRecord | undefined {
  return inMemoryUsers.get(id);
}

export function getInMemoryUserByEmail(email: string): InMemoryUserRecord | undefined {
  return inMemoryUsersByEmail.get(email.toLowerCase().trim());
}

export function updateInMemoryUser(id: string, updates: Partial<InMemoryUserRecord>): InMemoryUserRecord | undefined {
  const existing = inMemoryUsers.get(id);
  if (!existing) return undefined;
  const updated: InMemoryUserRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date(),
  };
  inMemoryUsers.set(id, updated);
  if (updated.email) {
    inMemoryUsersByEmail.set(updated.email.toLowerCase(), updated);
  }
  return updated;
}

export const CANONICAL_STARTER_USERS: Array<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plainPassword: string;
  jobTitle: string;
  department: string;
  phoneNumber: string;
  bio: string;
}> = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@warrant.studio",
    name: "System Administrator",
    role: UserRole.ADMINISTRATOR,
    plainPassword: "AdminPass123!",
    jobTitle: "Lead Security Architect",
    department: "InfoSec & Governance",
    phoneNumber: "+1 (555) 019-2831",
    bio: "Lead security and governance architect managing Warrant purchase policies and cryptographic limits.",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    email: "approver@warrant.studio",
    name: "Department Approver",
    role: UserRole.APPROVER,
    plainPassword: "ApproverPass123!",
    jobTitle: "Procurement Director",
    department: "Finance & Operations",
    phoneNumber: "+1 (555) 019-4820",
    bio: "Authorizes and monitors departmental procurement budgets and spend thresholds.",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    email: "auditor@warrant.studio",
    name: "Finance Auditor",
    role: UserRole.FINANCE_AUDITOR,
    plainPassword: "AuditorPass123!",
    jobTitle: "Lead Compliance Auditor",
    department: "Internal Audit & Risk",
    phoneNumber: "+1 (555) 019-3392",
    bio: "Audits RFC 8785 attestation packets, ledger reconciliation, and invariant adherence.",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    email: "requester@warrant.studio",
    name: "Staff Requester",
    role: UserRole.REQUESTER,
    plainPassword: "RequesterPass123!",
    jobTitle: "Staff Systems Engineer",
    department: "Cloud Platform",
    phoneNumber: "+1 (555) 019-7104",
    bio: "Requests autonomous purchasing mandates for dev environments and hardware tooling.",
  },
];

let starterUsersInitialized = false;

export async function initStarterUsers(): Promise<void> {
  if (starterUsersInitialized) return;
  for (const starter of CANONICAL_STARTER_USERS) {
    const passwordHash = await hashPassword(starter.plainPassword);
    const userRec: InMemoryUserRecord = {
      id: starter.id,
      authSubject: `user:${starter.id}`,
      email: starter.email.toLowerCase(),
      passwordHash,
      name: starter.name,
      role: starter.role,
      jobTitle: starter.jobTitle,
      department: starter.department,
      phoneNumber: starter.phoneNumber,
      bio: starter.bio,
      organizationId: "00000000-0000-0000-0000-000000000010",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      disabledAt: null,
    };
    inMemoryUsers.set(starter.id, userRec);
    inMemoryUsersByEmail.set(starter.email.toLowerCase(), userRec);

    // Also attempt seeding to database if DB is available
    try {
      await db
        .insert(organizations)
        .values({
          id: "00000000-0000-0000-0000-000000000010",
          name: "Warrant Enterprise HQ",
          slug: "warrant-hq",
        })
        .onConflictDoNothing();

      await db
        .insert(users)
        .values({
          id: starter.id,
          authSubject: `user:${starter.id}`,
          email: starter.email.toLowerCase(),
          passwordHash,
          name: starter.name,
          role: starter.role,
          jobTitle: starter.jobTitle,
          department: starter.department,
          phoneNumber: starter.phoneNumber,
          bio: starter.bio,
          organizationId: "00000000-0000-0000-0000-000000000010",
        })
        .onConflictDoNothing();

      await db
        .update(users)
        .set({ organizationId: "00000000-0000-0000-0000-000000000010" })
        .where(eq(users.id, starter.id));

      await db
        .insert(organizationMembers)
        .values({
          id: `00000000-0000-0000-0000-00000000002${starter.id.slice(-1)}`,
          organizationId: "00000000-0000-0000-0000-000000000010",
          userId: starter.id,
          role: starter.role === UserRole.ADMINISTRATOR ? "OWNER" : starter.role === UserRole.APPROVER ? "ADMIN" : "MEMBER",
        })
        .onConflictDoNothing();
    } catch {
      // Ignored if DB is in-memory/unavailable
    }
  }
  starterUsersInitialized = true;
}

export function formatAuthUser(user: {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  createdAt: Date | string;
  disabledAt?: Date | string | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email || "",
    name: user.name ?? null,
    role: (user.role as UserRole) || UserRole.REQUESTER,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
    disabledAt: user.disabledAt
      ? user.disabledAt instanceof Date
        ? user.disabledAt.toISOString()
        : String(user.disabledAt)
      : null,
  };
}

export async function registerUser(input: RegisterRequest): Promise<{
  token: string;
  user: AuthUser;
  expiresAt: string;
}> {
  await initStarterUsers();
  const normalizedEmail = input.email.trim().toLowerCase();

  // 1. Check if email already exists
  if (inMemoryUsersByEmail.has(normalizedEmail)) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  try {
    const existingDb = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingDb.length > 0) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }
  } catch (err: any) {
    if (err?.message === "EMAIL_ALREADY_EXISTS") throw err;
    // Continue with in-memory if DB connection not present
  }

  // 2. Hash password securely
  const passwordHash = await hashPassword(input.password);
  const newUserId = randomBytes(16).toString("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  const now = new Date();

  // Section 7.2: Public signups unconditionally default to REQUESTER role.
  const userRole: UserRole = UserRole.REQUESTER;

  const newUserRecord: InMemoryUserRecord = {
    id: newUserId,
    authSubject: `user:${newUserId}`,
    email: normalizedEmail,
    passwordHash,
    name: input.name ?? null,
    role: userRole,
    createdAt: now,
    updatedAt: now,
    disabledAt: null,
  };

  inMemoryUsers.set(newUserId, newUserRecord);
  inMemoryUsersByEmail.set(normalizedEmail, newUserRecord);

  try {
    await db.insert(users).values({
      id: newUserId,
      authSubject: `user:${newUserId}`,
      email: normalizedEmail,
      passwordHash,
      name: input.name ?? null,
      role: userRole,
      createdAt: now,
      updatedAt: now,
    });
  } catch (dbErr: any) {
    if (process.env.NODE_ENV === "production") {
      inMemoryUsers.delete(newUserId);
      inMemoryUsersByEmail.delete(normalizedEmail);
      const err = new Error("Database unavailable for user registration persistence");
      (err as any).code = "DATABASE_UNAVAILABLE";
      throw err;
    }
    // DB write failure tolerated if running in fallback mode
  }

  // 3. Issue session token
  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const sessionId = randomBytes(16).toString("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  const newSessionRecord: InMemorySessionRecord = {
    id: sessionId,
    userId: newUserId,
    tokenHash,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  };
  inMemorySessions.set(tokenHash, newSessionRecord);

  try {
    await db.insert(sessions).values({
      id: sessionId,
      userId: newUserId,
      tokenHash,
      expiresAt,
      createdAt: now,
    });
  } catch (dbErr: any) {
    if (process.env.NODE_ENV === "production") {
      inMemoryUsers.delete(newUserId);
      inMemoryUsersByEmail.delete(normalizedEmail);
      inMemorySessions.delete(tokenHash);
      const err = new Error("Database unavailable for session token persistence");
      (err as any).code = "DATABASE_UNAVAILABLE";
      throw err;
    }
    // Fallback mode
  }

  // Audit registration
  try {
    await logAuditEvent(db as any, {
      ownerId: newUserId,
      actorType: "USER",
      eventType: "USER_REGISTERED",
      entityType: "USER",
      entityId: newUserId,
      payload: { email: normalizedEmail, role: userRole },
    });
  } catch {
    // Non-blocking audit
  }

  recordInMemoryActivity(newUserId, {
    eventType: "USER_REGISTERED",
    entityType: "USER",
    entityId: newUserId,
    actorType: "USER",
    payload: { email: normalizedEmail, role: userRole },
  });


  return {
    token: rawToken,
    user: formatAuthUser(newUserRecord),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function loginUser(input: LoginRequest): Promise<{
  token: string;
  user: AuthUser;
  expiresAt: string;
}> {
  await initStarterUsers();
  const normalizedEmail = input.email.trim().toLowerCase();

  // Find user by email
  let userRecord: InMemoryUserRecord | undefined = inMemoryUsersByEmail.get(normalizedEmail);

  if (!userRecord) {
    try {
      const dbUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);
      if (dbUsers.length > 0 && dbUsers[0]) {
        const u = dbUsers[0];
        userRecord = {
          id: u.id,
          authSubject: u.authSubject,
          email: u.email || normalizedEmail,
          passwordHash: u.passwordHash || "",
          name: u.name ?? null,
          role: (u.role as UserRole) || UserRole.REQUESTER,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          disabledAt: u.disabledAt,
        };
        inMemoryUsers.set(u.id, userRecord);
        inMemoryUsersByEmail.set(normalizedEmail, userRecord);
      }
    } catch {
      // DB error
    }
  }

  if (!userRecord || !userRecord.passwordHash) {
    // Run dummy verify to mitigate timing attacks against non-existent accounts
    await verifyPassword(input.password, "scrypt:00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000");
    throw new Error("INVALID_CREDENTIALS");
  }

  if (userRecord.disabledAt) {
    throw new Error("ACCOUNT_DISABLED");
  }

  const isValidPassword = await verifyPassword(input.password, userRecord.passwordHash);
  if (!isValidPassword) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // Issue session token
  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const now = new Date();
  const sessionId = randomBytes(16).toString("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  const sessionRecord: InMemorySessionRecord = {
    id: sessionId,
    userId: userRecord.id,
    tokenHash,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  };
  inMemorySessions.set(tokenHash, sessionRecord);

  try {
    await db.insert(sessions).values({
      id: sessionId,
      userId: userRecord.id,
      tokenHash,
      expiresAt,
      createdAt: now,
    });
  } catch (dbErr: any) {
    if (process.env.NODE_ENV === "production") {
      inMemorySessions.delete(tokenHash);
      const err = new Error("Database unavailable for session token persistence");
      (err as any).code = "DATABASE_UNAVAILABLE";
      throw err;
    }
    // Fallback mode
  }

  // Audit login
  try {
    await logAuditEvent(db as any, {
      ownerId: userRecord.id,
      actorType: "USER",
      eventType: "USER_LOGGED_IN",
      entityType: "USER",
      entityId: userRecord.id,
      payload: { email: normalizedEmail, role: userRecord.role },
    });
  } catch {
    // Non-blocking
  }

  recordInMemoryActivity(userRecord.id, {
    eventType: "USER_LOGGED_IN",
    entityType: "USER",
    entityId: userRecord.id,
    actorType: "USER",
    payload: { email: normalizedEmail, role: userRecord.role },
  });


  return {
    token: rawToken,
    user: formatAuthUser(userRecord),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function verifySessionToken(rawToken: string): Promise<AuthUser | null> {
  await initStarterUsers();
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = createHash("sha256").update(rawToken.trim()).digest("hex");
  const now = new Date();

  // 1. Check in-memory session cache
  const memSession = inMemorySessions.get(tokenHash);
  if (memSession) {
    if (memSession.revokedAt || memSession.expiresAt <= now) {
      return null;
    }
    const memUser = inMemoryUsers.get(memSession.userId);
    if (!memUser || memUser.disabledAt) {
      return null;
    }
    return formatAuthUser(memUser);
  }

  // 2. Check DB sessions
  try {
    const dbSessions = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
      .limit(1);

    if (dbSessions.length === 0 || !dbSessions[0]) {
      return null;
    }

    const sess = dbSessions[0];
    const userRes = await db.select().from(users).where(eq(users.id, sess.userId)).limit(1);
    if (userRes.length === 0 || !userRes[0]) {
      return null;
    }
    const u = userRes[0];
    if (u.disabledAt) return null;

    // Cache in memory for subsequent requests
    const userRec: InMemoryUserRecord = {
      id: u.id,
      authSubject: u.authSubject,
      email: u.email || "",
      passwordHash: u.passwordHash || "",
      name: u.name ?? null,
      role: (u.role as UserRole) || UserRole.REQUESTER,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      disabledAt: u.disabledAt,
    };
    inMemoryUsers.set(u.id, userRec);
    if (u.email) inMemoryUsersByEmail.set(u.email.toLowerCase(), userRec);

    inMemorySessions.set(tokenHash, {
      id: sess.id,
      userId: sess.userId,
      tokenHash: sess.tokenHash,
      expiresAt: sess.expiresAt,
      revokedAt: sess.revokedAt,
      createdAt: sess.createdAt,
    });

    return formatAuthUser(userRec);
  } catch {
    return null;
  }
}

export async function revokeSessionToken(rawToken: string): Promise<boolean> {
  if (!rawToken || typeof rawToken !== "string") return false;
  const tokenHash = createHash("sha256").update(rawToken.trim()).digest("hex");
  const now = new Date();

  const memSession = inMemorySessions.get(tokenHash);
  if (memSession) {
    memSession.revokedAt = now;
  }

  try {
    await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(eq(sessions.tokenHash, tokenHash));
  } catch {
    // Non-blocking
  }

  return true;
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  await initStarterUsers();
  const mem = inMemoryUsers.get(userId);
  if (mem) return formatAuthUser(mem);

  try {
    const res = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (res.length > 0 && res[0]) {
      return formatAuthUser(res[0]);
    }
  } catch {
    // DB error
  }
  return null;
}
