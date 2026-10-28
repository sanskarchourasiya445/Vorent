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

/**
 * Client-facing Cart Item Schema for purchase proposals.
 * Boundary defense: Clients and AI shopping agents are strictly prohibited
 * from specifying unit prices or categories. Only the SKU and quantity are permitted.
 * The server resolves authoritative unitPriceMinor, category, title, and currency
 * from the server-side product catalog, completely neutralizing price tampering
 * and category evasion attacks.
 */
export const ClientCartItemRawSchema = z.object({
  sku: z.string().min(1, "SKU must not be empty"),
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .positive("Quantity must be a positive integer")
    .max(Number.MAX_SAFE_INTEGER, "Quantity exceeds maximum safe integer"),
  title: z.string().min(1, "Title must not be empty").optional(),
});

export const ClientCartItemSchema = z.preprocess(
  (val: any) => {
    if (val && typeof val === "object") {
      if (!val.title && typeof val.name === "string") {
        return { ...val, title: val.name };
      }
    }
    return val;
  },
  ClientCartItemRawSchema
);

export type ClientCartItem = z.infer<typeof ClientCartItemSchema>;

export const ClientCartSchema = z.object({
  currency: z.string().length(3, "Currency code must be 3 characters"),
  items: z.array(ClientCartItemSchema).min(1, "Cart must contain at least one item"),
});

export type ClientCart = z.infer<typeof ClientCartSchema>;

export const EvidenceSnapshotSchema = z.object({
  snapshotTimestamp: z.string().optional(),
  quotesVerified: z.boolean().optional(),
  evidenceComplete: z.boolean().optional(),
  stale: z.boolean().optional(),
  unknownCategories: z.array(z.string()).optional(),
  staleCategories: z.array(z.string()).optional(),
}).passthrough();

export type EvidenceSnapshot = z.infer<typeof EvidenceSnapshotSchema>;
