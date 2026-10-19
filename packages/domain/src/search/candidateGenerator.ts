import type { Cart, CartItem, EvidenceSnapshot, SearchSpaceDefinition } from "@warrant/contracts";

export interface GeneratedCandidate {
  candidateIndex: number;
  cart: Cart;
  evidence?: EvidenceSnapshot;
  description: string;
}

export const MAX_SAFE_COMBINATIONS = 5000;

/**
 * Deterministically generates finite candidate carts within explicit search bounds.
 * Prevents combinatorial explosion and deduplicates identical candidate states.
 */
export function generateCandidates(searchSpace: SearchSpaceDefinition): GeneratedCandidate[] {
  const categories = Array.from(new Set(searchSpace.categories.map((c) => c.toLowerCase().trim()))).sort();
  const pricePoints = Array.from(new Set(searchSpace.pricePointsMinor)).sort((a, b) => a - b);
  const quantities = Array.from(new Set(searchSpace.quantities)).sort((a, b) => a - b);
  const currencies = Array.from(new Set(searchSpace.currencies.map((c) => c.toUpperCase().trim()))).sort();
  const evidenceVariations = Array.from(new Set(searchSpace.evidenceVariations)).sort();
  const maxItems = Math.min(searchSpace.maxItemsPerCart ?? 2, 3);

  // 1. Check theoretical combinations to guard against unbounded explosions
  const singleItemCombos = categories.length * pricePoints.length * quantities.length * currencies.length * evidenceVariations.length;
  let estimatedTotal = singleItemCombos;

  if (maxItems >= 2) {
    // 2-item pairs
    const itemVariations = categories.length * pricePoints.length;
    const pairCount = (itemVariations * (itemVariations + 1)) / 2;
    estimatedTotal += pairCount * currencies.length * evidenceVariations.length;
  }

  if (estimatedTotal > MAX_SAFE_COMBINATIONS) {
    throw new Error(
      `Declared search space exceeds safety limit (${estimatedTotal} estimated combinations > ${MAX_SAFE_COMBINATIONS} max allowed). Narrow categories or price points.`,
    );
  }

  const candidates: GeneratedCandidate[] = [];
  const seenSignatures = new Set<string>();
  let candidateCounter = 0;

  function makeEvidence(variation: string, category: string): EvidenceSnapshot | undefined {
    switch (variation) {
      case "COMPLETE":
        return {
          snapshotTimestamp: "2026-10-19T10:00:00Z",
          quotesVerified: true,
          evidenceComplete: true,
          stale: false,
        };
      case "MISSING":
        return {
          snapshotTimestamp: "2026-10-19T10:00:00Z",
          quotesVerified: false,
          evidenceComplete: false,
          stale: false,
        };
      case "STALE":
        return {
          snapshotTimestamp: "2026-10-19T00:00:00Z",
          quotesVerified: true,
          evidenceComplete: true,
          stale: true,
          staleCategories: [category],
        };
      default:
        return undefined;
    }
  }

  function getCartSignature(cart: Cart, evidence?: EvidenceSnapshot): string {
    const itemsKey = cart.items
      .map((i) => `${i.sku}:${i.category}:${i.unitPriceMinor}:${i.quantity}:${i.currency ?? ""}`)
      .sort()
      .join("|");
    const evKey = evidence
      ? `${evidence.quotesVerified}:${evidence.evidenceComplete}:${evidence.stale}:${(evidence.staleCategories ?? []).join(",")}`
      : "no-evidence";
    return `${cart.currency}::${itemsKey}::${evKey}`;
  }

  function addCandidate(cart: Cart, evidence: EvidenceSnapshot | undefined, description: string) {
    const sig = getCartSignature(cart, evidence);
    if (seenSignatures.has(sig)) {
      return;
    }
    seenSignatures.add(sig);

    candidates.push({
      candidateIndex: candidateCounter++,
      cart,
      evidence,
      description,
    });
  }

  // 2. Generate Single-Item Carts
  for (const currency of currencies) {
    for (const category of categories) {
      for (const price of pricePoints) {
        for (const qty of quantities) {
          for (const evVar of evidenceVariations) {
            const item: CartItem = {
              sku: `item-${category}-${price}`,
              title: `Sample ${category} ($${(price / 100).toFixed(2)})`,
              category,
              unitPriceMinor: price,
              quantity: qty,
              currency,
            };

            const cart: Cart = {
              currency,
              items: [item],
            };

            const evidence = makeEvidence(evVar, category);
            addCandidate(cart, evidence, `Single ${category} item at ${price} minor units (${evVar} evidence)`);
          }
        }
      }
    }
  }

  // 3. Generate 2-Item Carts (if maxItems >= 2)
  if (maxItems >= 2) {
    for (const currency of currencies) {
      for (let i = 0; i < categories.length; i++) {
        const cat1 = categories[i]!;
        for (let j = i; j < categories.length; j++) {
          const cat2 = categories[j]!;

          for (const p1 of pricePoints) {
            for (const p2 of pricePoints) {
              for (const evVar of evidenceVariations) {
                const item1: CartItem = {
                  sku: `item-${cat1}-${p1}-1`,
                  title: `${cat1} item ($${(p1 / 100).toFixed(2)})`,
                  category: cat1,
                  unitPriceMinor: p1,
                  quantity: 1,
                  currency,
                };

                const item2: CartItem = {
                  sku: `item-${cat2}-${p2}-2`,
                  title: `${cat2} item ($${(p2 / 100).toFixed(2)})`,
                  category: cat2,
                  unitPriceMinor: p2,
                  quantity: 1,
                  currency,
                };

                const cart: Cart = {
                  currency,
                  items: [item1, item2],
                };

                const evidence = makeEvidence(evVar, cat1);
                addCandidate(cart, evidence, `Two items: ${cat1} (${p1}) and ${cat2} (${p2}) (${evVar} evidence)`);
              }
            }
          }
        }
      }
    }
  }

  // 4. Custom item templates if provided
  if (searchSpace.customItemTemplates && searchSpace.customItemTemplates.length > 0) {
    for (const template of searchSpace.customItemTemplates) {
      const currency = template.currency ?? currencies[0] ?? "USD";
      const item: CartItem = {
        sku: template.sku,
        title: template.title,
        category: template.category,
        unitPriceMinor: template.unitPriceMinor,
        quantity: 1,
        currency,
      };

      const cart: Cart = {
        currency,
        items: [item],
      };

      addCandidate(cart, makeEvidence("COMPLETE", template.category), `Custom item: ${template.title}`);
    }
  }

  return candidates;
}
