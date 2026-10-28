import { describe, it, expect } from "vitest";
import {
  AVAILABLE_POLICIES,
  getAvailablePolicies,
  fetchAvailablePolicies,
} from "../api/verificationService";
import { CANONICAL_POLICY_PRESETS, POLICY_PRESET_LIST } from "@warrant/test-fixtures";

describe("Frontend Policy Presets Consistency Suite", () => {
  it("AVAILABLE_POLICIES references canonical presets from @warrant/test-fixtures", () => {
    expect(AVAILABLE_POLICIES).toHaveLength(3);
    expect(AVAILABLE_POLICIES).toEqual(POLICY_PRESET_LIST);
    expect(AVAILABLE_POLICIES.map((p) => p.id)).toEqual([
      "pol_v1_books_hardware",
      "pol_v2_strict_peripherals",
      "pol_seeded_defect_unbounded_cart",
    ]);

    // Check that each preset in AVAILABLE_POLICIES exactly matches the canonical fixture
    for (const option of AVAILABLE_POLICIES) {
      const canonical = CANONICAL_POLICY_PRESETS[option.id];
      expect(canonical).toBeDefined();
      expect(option.name).toBe(canonical.name);
      expect(option.version).toBe(canonical.version);
      expect(option.hash).toBe(canonical.hash);
      expect(option.policyDocument).toEqual(canonical.policyDocument);
      expect(option.intent).toEqual(canonical.intent);
    }
  });

  it("verifies canonical cryptographic hashes are used on frontend PolicyOption objects", () => {
    const p1 = AVAILABLE_POLICIES.find((p) => p.id === "pol_v1_books_hardware")!;
    expect(p1.hash).toBe("93258bd2e0e10160490d8d690e79028c1886f96de0806b749e1822619a3cbbb5");

    const p2 = AVAILABLE_POLICIES.find((p) => p.id === "pol_v2_strict_peripherals")!;
    expect(p2.hash).toBe("b327a266d96b8461924c4baa78afd43f46669a1be5e5aacf419eab57c0a30f07");

    const p3 = AVAILABLE_POLICIES.find((p) => p.id === "pol_seeded_defect_unbounded_cart")!;
    expect(p3.hash).toBe("1d4ea3fac4f62cae288f43ec6ae466b757081ab1be31039e9f84d26c9f47183f");
  });

  it("getAvailablePolicies and fetchAvailablePolicies return defensive copies of canonical presets", async () => {
    const syncPolicies = getAvailablePolicies();
    expect(syncPolicies).toEqual(AVAILABLE_POLICIES);
    expect(syncPolicies).not.toBe(AVAILABLE_POLICIES); // different array reference

    const asyncPolicies = await fetchAvailablePolicies();
    expect(asyncPolicies).toEqual(AVAILABLE_POLICIES);
    expect(asyncPolicies).not.toBe(AVAILABLE_POLICIES); // different array reference
  });
});
