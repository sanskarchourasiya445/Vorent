import { describe, it, expect } from "vitest";
import { UserRole } from "@warrant/contracts";
import { authService } from "../api/authService";

describe("Frontend Auth Service (Master Brief Section 7)", () => {
  it("provides role enum constants", () => {
    expect(UserRole.ADMINISTRATOR).toBe("ADMINISTRATOR");
    expect(UserRole.APPROVER).toBe("APPROVER");
    expect(UserRole.FINANCE_AUDITOR).toBe("FINANCE_AUDITOR");
    expect(UserRole.REQUESTER).toBe("REQUESTER");
  });

  it("exports required authService methods", () => {
    expect(typeof authService.login).toBe("function");
    expect(typeof authService.register).toBe("function");
    expect(typeof authService.logout).toBe("function");
    expect(typeof authService.getMe).toBe("function");
    expect(typeof authService.getPersonas).toBe("function");
    expect(typeof authService.getToken).toBe("function");
  });
});
