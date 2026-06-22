import type { FieldContract } from '../types.js';

/** All field contracts, including inner fields of card items, at any depth. */
export function flattenFields(fields: FieldContract[]): FieldContract[] {
  const out: FieldContract[] = [];
  for (const f of fields) {
    out.push(f);
    if (f.itemFields) out.push(...flattenFields(f.itemFields));
  }
  return out;
}

/** Every 'Cards' field at any depth (top-level and nested inside item types). */
export function collectCardFields(fields: FieldContract[]): FieldContract[] {
  return flattenFields(fields).filter((f) => f.renderer === 'Cards');
}

/**
 * Card fields at any depth, unique by `itemTypeName` (first occurrence wins).
 * The same Sitecore template can be referenced at multiple depths (e.g. a
 * "Terminals" multilist both top-level and nested inside "Offers"); each
 * produces the same item type, so we emit/import it only once.
 */
export function collectCardTypes(fields: FieldContract[]): FieldContract[] {
  const seen = new Set<string>();
  const out: FieldContract[] = [];
  for (const f of collectCardFields(fields)) {
    const name = f.itemTypeName as string;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(f);
  }
  return out;
}
