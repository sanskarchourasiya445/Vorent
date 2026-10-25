/**
 * Authoritative Product Catalog for Warrant Studio.
 *
 * In accordance with the security architecture:
 * The AI shopping agent or client submits purchase proposals with SKU and quantity.
 * Price (unitPriceMinor), category, and title MUST be resolved on the server
 * from this authoritative catalog, preventing client price tampering or category evasion.
 */

export interface CatalogItem {
  sku: string;
  title: string;
  category: string;
  unitPriceMinor: number;
  currency: string;
  description?: string;
}

export const AUTHORITATIVE_CATALOG: Record<string, CatalogItem> = {
  // Compliant Hardware
  "hw-laptop-stand-001": {
    sku: "hw-laptop-stand-001",
    title: "Ergonomic Aluminum Laptop Stand",
    category: "Hardware",
    unitPriceMinor: 4500,
    currency: "USD",
  },
  "hw-mech-keyboard-002": {
    sku: "hw-mech-keyboard-002",
    title: "Mechanical Split Ergonomic Keyboard",
    category: "Hardware",
    unitPriceMinor: 18500,
    currency: "USD",
  },
  "hw-4k-monitor-003": {
    sku: "hw-4k-monitor-003",
    title: "27-inch 4K UHD Developer Display",
    category: "Peripherals",
    unitPriceMinor: 24900,
    currency: "USD",
  },
  "hw-studio-display-004": {
    sku: "hw-studio-display-004",
    title: "5K UltraFine Studio Display",
    category: "Peripherals",
    unitPriceMinor: 129900,
    currency: "USD",
  },
  // Reference Books
  "book-ddia-001": {
    sku: "book-ddia-001",
    title: "Designing Data-Intensive Applications",
    category: "Reference Books",
    unitPriceMinor: 4800,
    currency: "USD",
  },
  "book-types-prog-002": {
    sku: "book-types-prog-002",
    title: "Types and Programming Languages",
    category: "Reference Books",
    unitPriceMinor: 8500,
    currency: "USD",
  },
  // Prohibited Items (Loophole / Evasion / Counterexamples)
  "proh-amazon-giftcard-001": {
    sku: "proh-amazon-giftcard-001",
    title: "$100 Digital Gift Card",
    category: "Gift Cards",
    unitPriceMinor: 10000,
    currency: "USD",
  },
  "proh-game-pass-002": {
    sku: "proh-game-pass-002",
    title: "12-Month Gaming Pass Subscription",
    category: "Subscriptions & Recurring",
    unitPriceMinor: 12000,
    currency: "USD",
  },
  "proh-laser-device-003": {
    sku: "proh-laser-device-003",
    title: "5000mW High-Power Blue Laser Pointer",
    category: "Weapons / Lasers",
    unitPriceMinor: 15000,
    currency: "USD",
  },
  // Checkout Gate Presets
  "item_book_01": {
    sku: "item_book_01",
    title: "Designing Data-Intensive Applications",
    category: "Reference Books",
    unitPriceMinor: 4500,
    currency: "USD",
  },
  "item_card_01": {
    sku: "item_card_01",
    title: "Electronic Retail Gift Card",
    category: "Gift Cards",
    unitPriceMinor: 5000,
    currency: "USD",
  },
  "item_gpu_01": {
    sku: "item_gpu_01",
    title: "High-Performance Workstation GPU",
    category: "Hardware",
    unitPriceMinor: 75000,
    currency: "USD",
  },
  "item_board_01": {
    sku: "item_board_01",
    title: "Ergonomic Mechanical Keyboard",
    category: "Hardware",
    unitPriceMinor: 22000,
    currency: "USD",
  },
  // Standard Test SKUs
  "SKU-BOOK": {
    sku: "SKU-BOOK",
    title: "Clean Code",
    category: "Books",
    unitPriceMinor: 4000,
    currency: "USD",
  },
  "A": {
    sku: "A",
    title: "Cart A Item",
    category: "Books",
    unitPriceMinor: 6000,
    currency: "USD",
  },
  "B": {
    sku: "B",
    title: "Cart B Item",
    category: "Books",
    unitPriceMinor: 6000,
    currency: "USD",
  },
  "X": {
    sku: "X",
    title: "Item",
    category: "Books",
    unitPriceMinor: 1000,
    currency: "EUR",
  },
  "sku_book_01": {
    sku: "sku_book_01",
    title: "Clean Code Reference",
    category: "Reference Books",
    unitPriceMinor: 3500,
    currency: "USD",
  },
  "sku_hw_overprice": {
    sku: "sku_hw_overprice",
    title: "Custom Hardware Component",
    category: "Hardware",
    unitPriceMinor: 35000,
    currency: "USD",
  },
  "HW-MON-4K": {
    sku: "HW-MON-4K",
    title: "4K Monitor",
    category: "Hardware",
    unitPriceMinor: 22000,
    currency: "USD",
  },
  "HW-MON-4K-27": {
    sku: "HW-MON-4K-27",
    title: "4K Developer Display 27in",
    category: "Hardware",
    unitPriceMinor: 22000,
    currency: "USD",
  },
  "FURN-DESK-PAD-XL": {
    sku: "FURN-DESK-PAD-XL",
    title: "Desk Pad XL",
    category: "Peripherals",
    unitPriceMinor: 3500,
    currency: "USD",
  },
};

/**
 * Resolves an item from the authoritative catalog by SKU (case-insensitive).
 */
export function resolveCatalogItem(sku: string): CatalogItem | undefined {
  if (!sku) return undefined;
  const direct = AUTHORITATIVE_CATALOG[sku];
  if (direct) return direct;
  const lower = sku.toLowerCase();
  for (const [k, v] of Object.entries(AUTHORITATIVE_CATALOG)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}
