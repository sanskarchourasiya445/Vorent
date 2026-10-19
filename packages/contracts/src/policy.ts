import { z } from "zod";

/**
 * Compiled policy document schema for deterministic evaluation.
 * Monetary limits are inclusive and expressed in integer minor units (e.g. cents).
 */

export const PolicyDocumentSchema = z.object({
  schemaVersion: z.literal("1.0").default("1.0"),
  currency: z.string().length(3, "Currency code must be 3 characters"),
  maxItemPriceMinor: z
    .number()
    .int("Max item price must be an integer")
    .nonnegative("Max item price must be non-negative integer minor units")
    .max(Number.MAX_SAFE_INTEGER, "Max item price exceeds maximum safe integer")
    .optional(),
  maxCartTotalMinor: z
    .number()
    .int("Max cart total must be an integer")
    .nonnegative("Max cart total must be non-negative integer minor units")
    .max(Number.MAX_SAFE_INTEGER, "Max cart total exceeds maximum safe integer")
    .optional(),
  allowedCategories: z.array(z.string()).optional(),
  prohibitedCategories: z.array(z.string()).optional(),
  requireEvidence: z.boolean().optional(),
});

export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;
