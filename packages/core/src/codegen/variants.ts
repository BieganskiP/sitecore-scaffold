import { toTypeName } from '../identifiers.js';

/**
 * Normalizes a raw `--variants` list into valid, unique export names with
 * `Default` guaranteed first. Names are sanitized to valid PascalCase
 * identifiers (Sitecore variant display names may contain spaces, etc.).
 */
export function normalizeVariants(raw: string[]): string[] {
  const cleaned = raw.map((v) => toTypeName(v.trim())).filter(Boolean);
  const deduped = [...new Set(cleaned)];
  const withoutDefault = deduped.filter((v) => v !== 'Default');
  return ['Default', ...withoutDefault];
}
