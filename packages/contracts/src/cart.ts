import { z } from "zod";

/**
 * Cart and item contracts for Warrant purchase authorization.
 */

export const CartItemSchema = z.preprocess(
  (val: any) => {
    if (val && typeof val === "object") {
      if (!val.title && typeof val.name === "string") {
        return { ...val, title: val.name };
      }
    }
    return val;
  },
  z.object({
    sku: z.string().min(1, "SKU must not be empty"),
    title: z.string().min(1, "Title must not be empty"),
    category: z.string().min(1, "Category must not be empty"),
    unitPriceMinor: z
      .number()
      .int("Unit price must be an integer")
      .nonnegative("Unit price must be non-negative integer minor units")
      .max(Number.MAX_SAFE_INTEGER, "Unit price exceeds maximum safe integer"),
    quantity: z
      .number()
      .int("Quantity must be an integer")
      .positive("Quantity must be a positive integer")
      .max(Number.MAX_SAFE_INTEGER, "Quantity exceeds maximum safe integer"),
    currency: z.string().length(3, "Currency code must be 3 characters").optional(),
  }).passthrough()
);

export type CartItem = z.infer<typeof CartItemSchema>;

export const CartSchema = z.object({
  currency: z.string().length(3, "Currency code must be 3 characters"),
  items: z.array(CartItemSchema),
}).passthrough();

export type Cart = z.infer<typeof CartSchema>;

export const EvidenceSnapshotSchema = z.object({
  snapshotTimestamp: z.string().optional(),
  quotesVerified: z.boolean().optional(),
  evidenceComplete: z.boolean().optional(),
  stale: z.boolean().optional(),
  unknownCategories: z.array(z.string()).optional(),
  staleCategories: z.array(z.string()).optional(),
}).passthrough();

export type EvidenceSnapshot = z.infer<typeof EvidenceSnapshotSchema>;
