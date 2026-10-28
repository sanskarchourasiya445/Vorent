import { describe, it, expect } from "vitest";
import { compileIntent } from "../compiler/intentCompiler.js";
import { MANDATE_FIXTURES } from "@warrant/test-fixtures";

describe("Intent Compiler (Deterministic)", () => {
  it("compiles a clear, unambiguous mandate into valid PolicyDocument and ConfirmedIntent", () => {
    const mandate = MANDATE_FIXTURES.engineeringClear.text;
    const response = compileIntent({ mandateText: mandate });

    expect(response.validation.valid).toBe(true);
    expect(response.validation.errors).toHaveLength(0);
    expect(response.requiresUserConfirmation).toBe(true);

    // Policy checks
    expect(response.candidatePolicy.currency).toBe("USD");
    expect(response.candidatePolicy.maxItemPriceMinor).toBe(25000); // $250.00
    expect(response.candidatePolicy.maxCartTotalMinor).toBe(60000); // $600.00
    expect(response.candidatePolicy.allowedCategories).toEqual(
      expect.arrayContaining(["Hardware", "Reference Books", "Peripherals"]),
    );
    expect(response.candidatePolicy.prohibitedCategories).toEqual(
      expect.arrayContaining(["Gift Cards", "Weapons / Lasers", "Adult", "Subscriptions & Recurring"]),
    );
    expect(response.candidatePolicy.requireEvidence).toBe(true);

    // ConfirmedIntent checks
    expect(response.confirmedIntent.currency).toBe("USD");
    expect(response.confirmedIntent.maxItemPriceMinor).toBe(25000);
    expect(response.confirmedIntent.maxCartTotalMinor).toBe(60000);

    // Compiler metadata
    expect(response.compilerMetadata.deterministic).toBe(true);
    expect(response.compilerMetadata.compilerVersion).toContain("deterministic");
  });

  it("extracts non-USD currency (EUR) and tighter category restrictions", () => {
    const mandate = MANDATE_FIXTURES.ergonomicPeripherals.text;
    const response = compileIntent({ mandateText: mandate });

    expect(response.validation.valid).toBe(true);
    expect(response.candidatePolicy.currency).toBe("EUR");
    expect(response.candidatePolicy.maxItemPriceMinor).toBe(15000); // $150.00 in EUR
    expect(response.candidatePolicy.maxCartTotalMinor).toBe(30000); // $300.00 in EUR
    expect(response.candidatePolicy.prohibitedCategories).toContain("Entertainment & Gaming");
  });

  it("identifies missing whole-cart limit and flags questions/assumptions", () => {
    const mandate = MANDATE_FIXTURES.defectiveWholeCartOmitted.text;
    const response = compileIntent({ mandateText: mandate });

    expect(response.candidatePolicy.maxItemPriceMinor).toBe(25000);
    expect(response.candidatePolicy.maxCartTotalMinor).toBeUndefined();
    expect(response.candidatePolicy.prohibitedCategories).toContain("Gift Cards");
  });

  it("handles ambiguous single budget number, generating assumptions and clarifying questions", () => {
    const mandate = MANDATE_FIXTURES.ambiguousSingleBudget.text;
    const response = compileIntent({ mandateText: mandate });

    expect(response.validation.valid).toBe(true);
    expect(response.candidatePolicy.maxItemPriceMinor).toBe(10000);
    expect(response.candidatePolicy.maxCartTotalMinor).toBe(10000);
    expect(response.assumptions.length).toBeGreaterThan(0);
    expect(response.questions.some((q) => q.includes("each individual item, the whole cart, or both"))).toBe(true);
  });

  it("detects and neutralizes prompt-injection attempts without relaxing security rules", () => {
    const mandate = MANDATE_FIXTURES.promptInjectionAttempt.text;
    const response = compileIntent({ mandateText: mandate });

    // Must still produce valid policy document with default protections
    expect(response.validation.valid).toBe(true);
    expect(response.validation.warnings.some((w) => w.includes("Adversarial prompt injection pattern detected"))).toBe(true);
    // Gift cards were mentioned so they should be prohibited or handled safely
    expect(response.candidatePolicy.requireEvidence).toBe(true);
  });

  it("surfaces questions for unsupported concepts like tax, shipping, and recurring payments", () => {
    const mandate = "Allow dev books up to $50 each with shipping included, subject to 10% tax and recurring monthly renewals.";
    const response = compileIntent({ mandateText: mandate });

    expect(response.questions.some((q) => q.includes("Tax and VAT"))).toBe(true);
    expect(response.questions.some((q) => q.includes("Shipping fee"))).toBe(true);
    expect(response.questions.some((q) => q.includes("Recurring subscriptions"))).toBe(true);
  });

  it("handles contradictory purchase requirements honestly (per-item ceiling exceeds whole-cart budget)", () => {
    const mandate = "Engineering hardware up to $300 each with total budget of $200.";
    const response = compileIntent({ mandateText: mandate });

    expect(response.candidatePolicy.maxItemPriceMinor).toBe(30000); // $300.00
    expect(response.candidatePolicy.maxCartTotalMinor).toBe(20000); // $200.00
    expect(response.validation.warnings.some((w) =>
      w.includes("Per-item ceiling (30000) is greater than whole-cart limit (20000)")
    )).toBe(true);
    expect(response.requiresUserConfirmation).toBe(true);
  });

  it("preserves explicit constraints without silently inventing unstated categories or currency", () => {
    // Mandate with no currency and no category specifications
    const mandate = "Purchase items up to 50 each with maximum spend of 100.";
    const response = compileIntent({ mandateText: mandate });

    expect(response.candidatePolicy.maxItemPriceMinor).toBe(5000);
    expect(response.candidatePolicy.maxCartTotalMinor).toBe(10000);
    expect(response.candidatePolicy.allowedCategories).toBeUndefined();
    expect(response.assumptions.some((a) => a.includes("No currency symbol found; defaulted currency to USD"))).toBe(true);
    expect(response.questions.some((q) => q.includes("Which currency should apply to this policy?"))).toBe(true);
    expect(response.questions.some((q) => q.includes("Should purchases be restricted to specific categories"))).toBe(true);
  });
});
