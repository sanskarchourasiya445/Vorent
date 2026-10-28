import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MandateEditorPanel } from "../components/policy/MandateEditorPanel";
import type { CompileIntentResponse } from "@warrant/contracts";

const MOCK_COMPILED_RESPONSE: CompileIntentResponse = {
  confirmedIntent: {
    intentId: "intent_test_123",
    name: "Engineering Hardware Mandate",
    currency: "USD",
    maxItemPriceMinor: 25000,
    maxCartTotalMinor: 60000,
    allowedCategories: ["Hardware", "Reference Books"],
    prohibitedCategories: ["Gift Cards", "Weapons / Lasers"],
    requireEvidence: true,
  },
  candidatePolicy: {
    schemaVersion: "1.0",
    currency: "USD",
    maxItemPriceMinor: 25000,
    maxCartTotalMinor: 60000,
    allowedCategories: ["Hardware", "Reference Books"],
    prohibitedCategories: ["Gift Cards", "Weapons / Lasers"],
    requireEvidence: true,
  },
  assumptions: [
    "Assumed minor units in cents (USD)",
    "Extracted maximum item ceiling of $250.00",
  ],
  questions: [
    "Does the $250.00 limit apply strictly to hardware peripherals?",
    "Should delivery fees be included in the total cart ceiling?",
  ],
  requiresUserConfirmation: true,
  compilerMetadata: {
    compilerVersion: "1.0.0",
    sourceLength: 120,
    deterministic: true,
  },
  validation: {
    valid: true,
    errors: [],
    warnings: [],
  },
};

describe("MandateEditorPanel", () => {
  it("renders workstation header and adversarial prompt shield", () => {
    const html = renderToStaticMarkup(React.createElement(MandateEditorPanel));
    expect(html).toContain("Purchase Mandate Compiler");
    expect(html).toContain("Intent → Policy Rule Engine");
    expect(html).toContain("Adversarial Prompt Shield Active");
    expect(html).toContain("Neutralizes jailbreak attempts");
  });

  it("renders sample presets and syntax hint pills", () => {
    const html = renderToStaticMarkup(React.createElement(MandateEditorPanel));
    expect(html).toContain("Sample Presets:");
    expect(html).toContain("Engineering");
    expect(html).toContain("Ergonomic");
    expect(html).toContain("Ambiguous");
    expect(html).toContain("$ Item Ceiling");
    expect(html).toContain("$ Cart Total");
    expect(html).toContain("Category Whitelist");
    expect(html).toContain("Strict Quotes");
  });

  it("renders standby blueprint when no compilation result is present", () => {
    const html = renderToStaticMarkup(React.createElement(MandateEditorPanel));
    expect(html).toContain("Formal Policy Engine Standby");
    expect(html).toContain("Compile to Formal Policy");
    expect(html).toContain("Strict compiler: never defaults silently");
  });

  it("renders compiled policy preview, limits strip, and categories when compilation result provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(MandateEditorPanel, {
        initialCompilationResult: MOCK_COMPILED_RESPONSE,
      }),
    );
    expect(html).toContain("Engineering Hardware Mandate");
    expect(html).toContain("Candidate Validated");
    expect(html).toContain("Deterministic");
    expect(html).toContain("$250.00");
    expect(html).toContain("$600.00");
    expect(html).toContain("Strict Quotes");
    expect(html).toContain("✓ Hardware");
    expect(html).toContain("✓ Reference Books");
    expect(html).toContain("✕ Gift Cards");
    expect(html).toContain("✕ Weapons / Lasers");
  });

  it("renders clarifying questions banner when ambiguities are present", () => {
    const html = renderToStaticMarkup(
      React.createElement(MandateEditorPanel, {
        initialCompilationResult: MOCK_COMPILED_RESPONSE,
      }),
    );
    expect(html).toContain("Clarifying Questions Identified (2)");
    expect(html).toContain("Does the $250.00 limit apply strictly to hardware peripherals?");
    expect(html).toContain("Should delivery fees be included in the total cart ceiling?");
  });

  it("renders collapsible formal JSON rule trace and action bar buttons", () => {
    const html = renderToStaticMarkup(
      React.createElement(MandateEditorPanel, {
        initialCompilationResult: MOCK_COMPILED_RESPONSE,
      }),
    );
    expect(html).toContain("Formal JSON Rule Trace");
    expect(html).toContain("Copy JSON");
    expect(html).toContain("Save as Policy");
    expect(html).toContain("Test in Verification Studio");
    expect(html).toContain("Requires verification test before deployment or approval.");
  });
});
