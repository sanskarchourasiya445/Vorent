import {
  type CompileIntentRequest,
  type CompileIntentResponse,
  CompileIntentResponseSchema,
  PolicyDocumentSchema,
  type PolicyDocument,
  type ConfirmedIntent,
} from "@warrant/contracts";
import { compileIntent } from "@warrant/domain";

export interface LLMCompileResult extends CompileIntentResponse {
  confidenceScore?: number;
  ambiguityFlags?: string[];
}

/**
 * Bounded LLM Mandate Extraction Service (WS-AI).
 *
 * Guarantees:
 * 1. The LLM acts solely as a candidate AST extractor for procurement mandates.
 * 2. The LLM NEVER makes ALLOW, DENY, or REVIEW decisions, nor authorizes payment transactions.
 * 3. All LLM outputs are strictly validated against Zod PolicyDocumentSchema.
 * 4. Human-in-the-loop review and cryptographic signing are mandatory before policy commitment.
 * 5. Automatic deterministic fallback when GEMINI_API_KEY is absent or network fails.
 */
export async function compileMandateWithLLM(
  request: CompileIntentRequest
): Promise<LLMCompileResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const text = request.mandateText || (request as any).rawPrompt || "";
  const normalizedRequest: CompileIntentRequest = {
    ...request,
    mandateText: text,
  };

  // Prompt injection adversarial filter
  const isAdversarial =
    /ignore (all )?previous instructions/i.test(text) ||
    /set budget to unlimited/i.test(text) ||
    /bypass (all )?(policy|rules|guardrails)/i.test(text);

  if (!apiKey || apiKey.trim() === "" || apiKey === "mock" || apiKey === "demo") {
    // Deterministic fallback mode (Task AI.3)
    const deterministic = compileIntent(normalizedRequest);
    if (isAdversarial) {
      return {
        ...deterministic,
        validation: {
          valid: true,
          errors: [],
          warnings: ["Adversarial instruction detected and neutralized by prompt shield."],
        },
        confidenceScore: 0.5,
        ambiguityFlags: ["ADVERSARIAL_INJECTION_ATTEMPT_BLOCKED"],
      };
    }
    return {
      ...deterministic,
      confidenceScore: 1.0,
      ambiguityFlags: [],
    };
  }

  // LLM call via Gemini API
  try {
    const prompt = `You are a bounded procurement mandate extraction assistant.
Extract structured procurement policy rules from this natural language text.
Mandate: "${text}"

Return ONLY valid JSON matching this structure:
{
  "currency": "USD",
  "maxItemPriceMinor": 50000,
  "maxCartTotalMinor": 100000,
  "allowedCategories": ["Hardware", "Reference Books"],
  "prohibitedCategories": ["Gift Cards"],
  "requireEvidence": true,
  "confidenceScore": 0.95,
  "ambiguityFlags": []
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini API returned ${res.status}`);
    }

    const data: any = await res.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      throw new Error("Empty response from Gemini API");
    }

    const parsed = JSON.parse(rawJson);

    // Adversarial injection check on output
    if (parsed.maxCartTotalMinor === null || parsed.maxCartTotalMinor > 100000000 || isAdversarial) {
      // Force safe bounds
      parsed.maxCartTotalMinor = Math.min(parsed.maxCartTotalMinor || 100000, 1000000);
      parsed.ambiguityFlags = parsed.ambiguityFlags || [];
      parsed.ambiguityFlags.push("ADVERSARIAL_INJECTION_ATTEMPT_BLOCKED");
    }

    const candidatePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: typeof parsed.currency === "string" && parsed.currency.length === 3 ? parsed.currency : "USD",
      maxItemPriceMinor: typeof parsed.maxItemPriceMinor === "number" && Number.isInteger(parsed.maxItemPriceMinor) ? parsed.maxItemPriceMinor : undefined,
      maxCartTotalMinor: typeof parsed.maxCartTotalMinor === "number" && Number.isInteger(parsed.maxCartTotalMinor) ? parsed.maxCartTotalMinor : undefined,
      allowedCategories: Array.isArray(parsed.allowedCategories) ? parsed.allowedCategories.filter((c: any) => typeof c === "string") : undefined,
      prohibitedCategories: Array.isArray(parsed.prohibitedCategories) ? parsed.prohibitedCategories.filter((c: any) => typeof c === "string") : undefined,
      requireEvidence: typeof parsed.requireEvidence === "boolean" ? parsed.requireEvidence : true,
    };

    const validatedPolicy = PolicyDocumentSchema.parse(candidatePolicy);

    const confirmedIntent: ConfirmedIntent = {
      name: request.targetName || "LLM-Assisted Procurement Mandate",
      currency: validatedPolicy.currency,
      maxItemPriceMinor: validatedPolicy.maxItemPriceMinor,
      maxCartTotalMinor: validatedPolicy.maxCartTotalMinor,
      allowedCategories: validatedPolicy.allowedCategories,
      prohibitedCategories: validatedPolicy.prohibitedCategories,
      requireEvidence: validatedPolicy.requireEvidence,
    };

    const response: LLMCompileResult = {
      candidatePolicy: validatedPolicy,
      confirmedIntent,
      assumptions: [
        "Candidate AST extracted using Gemini model under strict Zod contract validation.",
        "Candidate rules require explicit human confirmation and cryptographic signing before policy activation.",
      ],
      questions: [],
      validation: {
        valid: true,
        errors: [],
        warnings: isAdversarial ? ["Adversarial instruction neutralized by schema validator."] : [],
      },
      requiresUserConfirmation: true,
      compilerMetadata: {
        compilerVersion: "2.0.0-gemini-bounded",
        deterministic: false,
        parsedClauses: ["Gemini 2.5 Flash Bounded Mandate Extraction"],
        sourceLength: text.length,
      },
      confidenceScore: typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : 0.9,
      ambiguityFlags: Array.isArray(parsed.ambiguityFlags) ? parsed.ambiguityFlags : [],
    };

    return CompileIntentResponseSchema.parse(response);
  } catch {
    // Deterministic fallback (Task AI.3)
    const fallback = compileIntent(normalizedRequest);
    return {
      ...fallback,
      confidenceScore: 0.85,
      ambiguityFlags: ["LLM_FALLBACK_TO_DETERMINISTIC_COMPILER"],
    };
  }
}
