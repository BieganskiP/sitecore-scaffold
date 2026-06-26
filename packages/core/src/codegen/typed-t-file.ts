export function renderTypedTFile(i18nPackage: string): string {
  return `import { useI18n } from '${i18nPackage}';
import type { DictionaryKey } from './dictionary-keys';

/**
 * Type-safe wrapper over next-localization's \`t\`. Keys are constrained to the
 * generated \`DictionaryKey\` union, so unknown keys are compile-time errors.
 * Customize freely — this file is scaffolded once and never overwritten without --force.
 */
export function useTypedT() {
  const { t } = useI18n();
  return (key: DictionaryKey, params?: Record<string, unknown>, lang?: string) =>
    t(key, params, lang);
}
`;
}
