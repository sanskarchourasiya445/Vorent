import { z } from "zod";
import { UserRoleZodSchema } from "./enums.js";

/**
 * User Profile representation.
 * Internal credentials and sensitive hashes are never included.
 */
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  role: UserRoleZodSchema,
  avatarUrl: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  organizationRole: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Request payload for updating user profile.
 * Notice: Role, ID, and Email cannot be changed via profile update (prevents privilege escalation).
 */
export const UpdateProfileRequestSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(100).optional(),
  avatarUrl: z.string().url("Must be a valid URL").or(z.string().max(255)).nullable().optional(),
  jobTitle: z.string().trim().max(100).nullable().optional(),
  department: z.string().trim().max(100).nullable().optional(),
  phoneNumber: z.string().trim().max(30).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
});

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

/**
 * User Preferences representation.
 */
export const UserPreferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).default("system"),
  defaultPolicyId: z.string().nullable().optional(),
  emailNotifications: z.boolean().default(true),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/**
 * Request payload for updating preferences.
 */
export const UpdatePreferencesRequestSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  defaultPolicyId: z.string().max(100).nullable().optional(),
  emailNotifications: z.boolean().optional(),
});

export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;

/**
 * Organization representation.
 */
export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  membershipRole: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
  createdAt: z.string(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

/**
 * Organization Member representation.
 */
export const OrganizationMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().nullable().optional(),
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
  createdAt: z.string(),
});

export type OrganizationMember = z.infer<typeof OrganizationMemberSchema>;

/**
 * Detailed Organization view with active members.
 */
export const OrganizationDetailsSchema = OrganizationSchema.extend({
  members: z.array(OrganizationMemberSchema),
});

export type OrganizationDetails = z.infer<typeof OrganizationDetailsSchema>;

/**
 * Request payload for inviting/adding a workspace member.
 */
export const InviteMemberRequestSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;

/**
 * Change password payload.
 */
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters long"),
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/**
 * Account security activity item.
 */
export const AccountActivityItemSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable().optional(),
  actorType: z.string(),
  payload: z.record(z.any()).default({}),
  createdAt: z.string(),
});

export type AccountActivityItem = z.infer<typeof AccountActivityItemSchema>;

/**
 * User Session representation.
 */
export const UserSessionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  isCurrent: z.boolean(),
});

export type UserSession = z.infer<typeof UserSessionSchema>;

/**
 * Connected services status.
 */
export const ConnectedServicesResponseSchema = z.object({
  paypal: z.object({
    status: z.enum(["CONNECTED", "DEGRADED", "UNCONFIGURED"]),
    environment: z.enum(["SANDBOX", "LIVE"]),
    ordersV2Available: z.boolean(),
    reconciliationAvailable: z.boolean(),
    webhookConfigured: z.boolean(),
  }),
  gemini: z.object({
    status: z.enum(["CONNECTED", "UNCONFIGURED"]),
    model: z.string(),
    mandateCompilationAvailable: z.boolean(),
  }),
  database: z.object({
    configured: z.boolean(),
    connected: z.boolean(),
    latencyMs: z.number().optional(),
  }),
});

export type ConnectedServicesResponse = z.infer<typeof ConnectedServicesResponseSchema>;
