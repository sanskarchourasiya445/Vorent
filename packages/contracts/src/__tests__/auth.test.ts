import { describe, it, expect } from "vitest";
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  AuthUserSchema,
  AuthSessionResponseSchema,
  UserRole,
} from "../index.js";

describe("Authentication Contracts", () => {
  it("validates valid registration request", () => {
    const input = {
      email: "user@EXAMPLE.COM ",
      password: "securePassword123!",
      name: " Alice Smith ",
    };
    const parsed = RegisterRequestSchema.parse(input);
    expect(parsed.email).toBe("user@example.com");
    expect(parsed.password).toBe("securePassword123!");
    expect(parsed.name).toBe("Alice Smith");
  });

  it("rejects short passwords in registration", () => {
    const input = {
      email: "user@example.com",
      password: "123",
    };
    const res = RegisterRequestSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  it("validates login request", () => {
    const input = {
      email: "User@Domain.Com",
      password: "secret",
    };
    const parsed = LoginRequestSchema.parse(input);
    expect(parsed.email).toBe("user@domain.com");
  });

  it("validates auth user and user roles", () => {
    const user = {
      id: "a0000000-0000-0000-0000-000000000001",
      email: "admin@warrant.studio",
      name: "Admin User",
      role: UserRole.ADMINISTRATOR,
      createdAt: "2026-10-24T00:00:00.000Z",
    };
    const parsed = AuthUserSchema.parse(user);
    expect(parsed.role).toBe("ADMINISTRATOR");
  });

  it("validates auth session response", () => {
    const session = {
      token: "opaque_session_token_xyz",
      user: {
        id: "b0000000-0000-0000-0000-000000000002",
        email: "requester@warrant.studio",
        name: "Test Requester",
        role: UserRole.REQUESTER,
        createdAt: "2026-10-24T00:00:00.000Z",
      },
      expiresAt: "2026-10-25T00:00:00.000Z",
    };
    const parsed = AuthSessionResponseSchema.parse(session);
    expect(parsed.token).toBe("opaque_session_token_xyz");
    expect(parsed.user.role).toBe("REQUESTER");
  });
});
