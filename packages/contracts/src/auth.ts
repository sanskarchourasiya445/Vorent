import { z } from "zod";
import { UserRoleZodSchema, type UserRole } from "./enums.js";
export type { UserRole };

/**
 * Registration request payload.
 * Section 7.2: Public signups are permitted, but server unconditionally
 * assigns the least-privileged REQUESTER role. Client cannot supply role.
 */
export const RegisterRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email("Invalid email address")),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  name: z.string().trim().min(1, "Name cannot be empty").max(100).optional(),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * Login request payload.
 */
export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email("Invalid email address")),
  password: z.string().min(1, "Password is required"),
});


export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Authenticated user profile returned to clients.
 * Passwords and salts are never returned.
 */
export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  role: UserRoleZodSchema,
  createdAt: z.string(),
  disabledAt: z.string().nullable().optional(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

/**
 * Authentication response on successful login or registration.
 */
export const AuthSessionResponseSchema = z.object({
  token: z.string(),
  user: AuthUserSchema,
  expiresAt: z.string(),
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

/**
 * Current user identity endpoint response (GET /api/auth/me).
 */
export const AuthMeResponseSchema = z.object({
  user: AuthUserSchema,
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

/**
 * Logout response.
 */
export const LogoutResponseSchema = z.object({
  success: z.boolean(),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
