import {
  type AuthSessionResponse,
  type AuthMeResponse,
  type RegisterRequest,
  type LoginRequest,
  type LogoutResponse,
  UserRole,
} from "@warrant/contracts";

import { request, setStoredAuthToken, getStoredAuthToken } from "./client";

export interface PersonaInfo {
  email: string;
  name: string;
  role: UserRole;
  passwordHint: string;
}

export interface PersonasResponse {
  personas: PersonaInfo[];
  roles: UserRole[];
}

export const authService = {
  /**
   * Register a new user with least-privileged role (REQUESTER).
   */
  async register(input: RegisterRequest): Promise<AuthSessionResponse> {
    const data = await request<AuthSessionResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (data.token) {
      setStoredAuthToken(data.token);
    }
    return data;
  },

  /**
   * Log in with email and password.
   */
  async login(input: LoginRequest): Promise<AuthSessionResponse> {
    const data = await request<AuthSessionResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (data.token) {
      setStoredAuthToken(data.token);
    }
    return data;
  },

  /**
   * Log out active session.
   */
  async logout(): Promise<void> {
    try {
      await request<LogoutResponse>("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Best-effort remote revocation
    } finally {
      setStoredAuthToken(null);
    }
  },

  /**
   * Fetch currently authenticated user profile.
   */
  async getMe(): Promise<AuthMeResponse> {
    return await request<AuthMeResponse>("/api/auth/me", {
      method: "GET",
    });
  },

  /**
   * Get available starter personas for quick role switching/evaluations.
   */
  async getPersonas(): Promise<PersonasResponse> {
    return await request<PersonasResponse>("/api/auth/personas", {
      method: "GET",
    });
  },

  /**
   * Inspect local stored session token.
   */
  getToken(): string | null {
    return getStoredAuthToken();
  },
};
