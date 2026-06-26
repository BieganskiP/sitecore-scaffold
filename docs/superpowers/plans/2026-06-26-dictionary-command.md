# Dictionary Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `dictionary` CLI command that fetches the Sitecore dictionary from Experience Edge and generates a type-safe keys map plus a typed `useTypedT()` wrapper over `next-localization`.

**Architecture:** Mirror the existing layout flow (Edge query → fetch → normalize → codegen) across the `core` and `cli` packages. New Edge query + paginated client method in `core`, a `build` normalizer, two codegen renderers, and a `runDictionary` command in `cli` that reuses the established config/deps/dry-run/force conventions.

**Tech Stack:** TypeScript, Node ESM, vitest. Monorepo: `@sitecore-scaffold/core` and `@sitecore-scaffold/cli`.

**Reference spec:** `docs/superpowers/specs/2026-06-26-dictionary-command-design.md`

**Conventions to follow (already in the codebase):**
- Generated key/value literals: single-quoted, escape `\` and `'`.
- Dependency injection for commands: `deps?: Partial<XDeps>` with `loadConfig` + a fetch function, defaulting to real implementations.
- Tests use `mkdtempSync(join(tmpdir(), 'scaffold-…-'))` for filesystem and `vi.fn()` mocks for `loadConfig`/fetch.
- Run a single test file with: `npx vitest run <path>` from the repo root.
- Run the whole suite with: `npm test`.

---

### Task 1: Config — add `i18nPath` and `i18nPackage`

**Files:**
- Modify: `packages/core/src/types.ts` (add two fields to `ScaffoldConfig`)
- Modify: `packages/core/src/config/load.ts` (apply defaults)
- Modify: `sitecore-scaffold.config.example.ts` (document the options)
- Test: `packages/core/test/config-load.test.ts` (assert defaults)

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('loadConfig', …)` block in `packages/core/test/config-load.test.ts`:

```ts
it('defaults i18nPath and i18nPackage when not specified', async () => {
  const p = writeConfig(dir, `export default {
    edge: { endpoint: process.env.SITECORE_EDGE_URL, apiKey: process.env.SITECORE_EDGE_TOKEN, site: 'my-site', defaultLanguage: 'en' },
    componentPath: 'src/components',
    componentPropsImport: 'lib/component-props',
    sitecorePackage: '@sitecore-content-sdk/nextjs',
    useDatasourceCheck: true,
    generateMocks: true,
    fieldTypeOverrides: {},
  };`);
  const cfg = await loadConfig(p);
  expect(cfg.i18nPath).toBe('src/lib/i18n');
  expect(cfg.i18nPackage).toBe('next-localization');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/config-load.test.ts`
Expected: FAIL — `cfg.i18nPath` is `undefined` (property missing on type / value).

- [ ] **Step 3: Add the fields to `ScaffoldConfig`**

In `packages/core/src/types.ts`, add to the `ScaffoldConfig` interface (after `fieldTypeOverrides`):

```ts
  /** Output directory for generated i18n artifacts (dictionary keys + typed t wrapper). */
  i18nPath: string;
  /** Package that provides `useI18n` for the generated typed t wrapper. */
  i18nPackage: string;
```

- [ ] **Step 4: Apply defaults in `load.ts`**

In `packages/core/src/config/load.ts`, add to the returned object literal (after `fieldTypeOverrides: …,`):

```ts
    i18nPath: loaded.i18nPath ?? 'src/lib/i18n',
    i18nPackage: loaded.i18nPackage ?? 'next-localization',
```

- [ ] **Step 5: Document in the example config**

In `sitecore-scaffold.config.example.ts`, add before the closing `};` (after the `fieldTypeOverrides: {},` line):

```ts
  i18nPath: 'src/lib/i18n', // where dictionary-keys.ts and use-typed-t.ts are written
  i18nPackage: 'next-localization', // provides useI18n() for the typed t wrapper
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/core/test/config-load.test.ts`
Expected: PASS (all tests, including the existing ones).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config/load.ts sitecore-scaffold.config.example.ts packages/core/test/config-load.test.ts
git commit -m "feat(core): add i18nPath and i18nPackage config options"
```

---

### Task 2: Edge — `DICTIONARY_QUERY` + paginated `getDictionary`

**Files:**
- Modify: `packages/core/src/edge/query.ts` (add `DICTIONARY_QUERY`)
- Modify: `packages/core/src/edge/client.ts` (add `getDictionary`)
- Test: `packages/core/test/edge-client.test.ts` (pagination + errors)

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `packages/core/test/edge-client.test.ts`:

```ts
describe('EdgeClient.getDictionary', () => {
  it('follows pagination and concatenates all entries', async () => {
    const page1 = {
      data: { site: { siteInfo: { dictionary: {
        results: [{ key: 'Nav.Login', value: 'Log in' }],
        pageInfo: { endCursor: 'CURSOR1', hasNext: true },
      } } } },
    };
    const page2 = {
      data: { site: { siteInfo: { dictionary: {
        results: [{ key: 'Home.Title', value: 'Home' }],
        pageInfo: { endCursor: 'CURSOR2', hasNext: false },
      } } } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });
    const client = new EdgeClient(config, fetchMock as unknown as typeof fetch);

    const entries = await client.getDictionary('en');

    expect(entries).toEqual([
      { key: 'Nav.Login', value: 'Log in' },
      { key: 'Home.Title', value: 'Home' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call must pass the first page's endCursor as `after`.
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.variables.after).toBe('CURSOR1');
    expect(secondBody.variables).toMatchObject({ site: 'my-site', language: 'en' });
  });

  it('throws on GraphQL errors array', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'bad dictionary query' }] }),
    });
    const client = new EdgeClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.getDictionary('en')).rejects.toThrow(/bad dictionary query/);
  });

  it('throws masking the key on HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    const client = new EdgeClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.getDictionary('en')).rejects.toThrow(/401/);
    await expect(client.getDictionary('en')).rejects.not.toThrow(/secret-token/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/edge-client.test.ts`
Expected: FAIL — `client.getDictionary is not a function`.

- [ ] **Step 3: Add the query**

In `packages/core/src/edge/query.ts`, append:

```ts
export const DICTIONARY_QUERY = `query GetDictionary($site: String!, $language: String!, $after: String) {
  site {
    siteInfo(site: $site) {
      dictionary(language: $language, first: 1000, after: $after) {
        results { key value }
        pageInfo { endCursor hasNext }
      }
    }
  }
}`;
```

- [ ] **Step 4: Add `getDictionary` to the client**

In `packages/core/src/edge/client.ts`:

Update the imports line to include the new query:

```ts
import { LAYOUT_QUERY, DICTIONARY_QUERY } from './query.js';
```

Add a response interface beside `LayoutResponse`:

```ts
export interface DictionaryEntry {
  key: string;
  value: string;
}

interface DictionaryResponse {
  data?: {
    site?: {
      siteInfo?: {
        dictionary?: {
          results?: DictionaryEntry[];
          pageInfo?: { endCursor?: string | null; hasNext?: boolean };
        } | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}
```

Add this method to the `EdgeClient` class (after `getLayout`):

```ts
  async getDictionary(language: string): Promise<DictionaryEntry[]> {
    const entries: DictionaryEntry[] = [];
    let after: string | null = null;

    do {
      const res = await this.fetchFn(this.config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', sc_apikey: this.config.apiKey },
        body: JSON.stringify({
          query: DICTIONARY_QUERY,
          variables: { site: this.config.site, language, after },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Edge request failed: HTTP ${res.status} ${text}`.trim());
      }

      const json = (await res.json()) as DictionaryResponse;
      if (json.errors?.length) {
        throw new Error(`Edge GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
      }

      const dict = json.data?.site?.siteInfo?.dictionary;
      entries.push(...(dict?.results ?? []));

      const pageInfo = dict?.pageInfo;
      after = pageInfo?.hasNext ? pageInfo.endCursor ?? null : null;
    } while (after !== null);

    return entries;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/core/test/edge-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/edge/query.ts packages/core/src/edge/client.ts packages/core/test/edge-client.test.ts
git commit -m "feat(core): fetch paginated dictionary from Experience Edge"
```

---

### Task 3: `dictionary/build.ts` — normalize (dedupe + sort + empty warning)

**Files:**
- Create: `packages/core/src/dictionary/build.ts`
- Test: `packages/core/test/dictionary-build.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/dictionary-build.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDictionary } from '../src/dictionary/build.js';

describe('buildDictionary', () => {
  it('dedupes and sorts keys alphabetically', () => {
    const result = buildDictionary([
      { key: 'Nav.Login', value: 'Log in' },
      { key: 'Home.Title', value: 'Home' },
      { key: 'Nav.Login', value: 'Log in (dup)' },
    ]);
    expect(result.keys).toEqual(['Home.Title', 'Nav.Login']);
    expect(result.warnings).toEqual([]);
  });

  it('warns when the dictionary is empty', () => {
    const result = buildDictionary([]);
    expect(result.keys).toEqual([]);
    expect(result.warnings.join('\n')).toMatch(/no dictionary entries/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/dictionary-build.test.ts`
Expected: FAIL — cannot find module `../src/dictionary/build.js`.

- [ ] **Step 3: Implement `buildDictionary`**

Create `packages/core/src/dictionary/build.ts`:

```ts
import type { DictionaryEntry } from '../edge/client.js';

export interface DictionaryBuildResult {
  /** Unique dictionary keys, sorted alphabetically for stable diffs. */
  keys: string[];
  warnings: string[];
}

export function buildDictionary(entries: DictionaryEntry[]): DictionaryBuildResult {
  const keys = [...new Set(entries.map((e) => e.key))].sort((a, b) => a.localeCompare(b));
  const warnings: string[] = [];
  if (keys.length === 0) {
    warnings.push('no dictionary entries found for this site/language');
  }
  return { keys, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/dictionary-build.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dictionary/build.ts packages/core/test/dictionary-build.test.ts
git commit -m "feat(core): normalize dictionary entries (dedupe, sort, empty warning)"
```

---

### Task 4: `codegen/dictionary-file.ts` — keys const + derived type

**Files:**
- Create: `packages/core/src/codegen/dictionary-file.ts`
- Test: `packages/core/test/codegen-dictionary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/codegen-dictionary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderDictionaryFile } from '../src/codegen/dictionary-file.js';

describe('renderDictionaryFile', () => {
  it('emits a const map and a derived key type', () => {
    const out = renderDictionaryFile(['Home.Title', 'Nav.Login']);
    expect(out).toContain('export const dictionaryKeys = {');
    expect(out).toContain("'Home.Title': 'Home.Title',");
    expect(out).toContain("'Nav.Login': 'Nav.Login',");
    expect(out).toContain('} as const;');
    expect(out).toContain('export type DictionaryKey = keyof typeof dictionaryKeys;');
    expect(out).toContain('AUTO-GENERATED');
  });

  it('escapes single quotes and backslashes in keys', () => {
    const out = renderDictionaryFile(["It's", 'a\\b']);
    expect(out).toContain("'It\\'s': 'It\\'s',");
    expect(out).toContain("'a\\\\b': 'a\\\\b',");
  });

  it('emits a valid empty map when there are no keys', () => {
    const out = renderDictionaryFile([]);
    expect(out).toContain('export const dictionaryKeys = {} as const;');
    expect(out).toContain('export type DictionaryKey = keyof typeof dictionaryKeys;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/codegen-dictionary.test.ts`
Expected: FAIL — cannot find module `../src/codegen/dictionary-file.js`.

- [ ] **Step 3: Implement `renderDictionaryFile`**

Create `packages/core/src/codegen/dictionary-file.ts`:

```ts
/** A single-quoted TS string literal with backslashes and quotes escaped. */
function lit(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function renderDictionaryFile(keys: string[]): string {
  const entries = keys.map((k) => `  ${lit(k)}: ${lit(k)},`).join('\n');
  const body = entries ? `\n${entries}\n` : '';
  return `// AUTO-GENERATED by sitecore-scaffold. Do not edit.
export const dictionaryKeys = {${body}} as const;

export type DictionaryKey = keyof typeof dictionaryKeys;
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/codegen-dictionary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/codegen/dictionary-file.ts packages/core/test/codegen-dictionary.test.ts
git commit -m "feat(core): render type-safe dictionary keys file"
```

---

### Task 5: `codegen/typed-t-file.ts` — typed `useTypedT` wrapper

**Files:**
- Create: `packages/core/src/codegen/typed-t-file.ts`
- Test: `packages/core/test/codegen-typed-t.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/codegen-typed-t.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderTypedTFile } from '../src/codegen/typed-t-file.js';

describe('renderTypedTFile', () => {
  it('imports useI18n from the configured package and constrains keys', () => {
    const out = renderTypedTFile('next-localization');
    expect(out).toContain("import { useI18n } from 'next-localization';");
    expect(out).toContain("import type { DictionaryKey } from './dictionary-keys';");
    expect(out).toContain('export function useTypedT()');
    expect(out).toContain('const { t } = useI18n();');
    expect(out).toContain('key: DictionaryKey');
  });

  it('respects a custom i18n package', () => {
    const out = renderTypedTFile('@my/i18n');
    expect(out).toContain("import { useI18n } from '@my/i18n';");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/codegen-typed-t.test.ts`
Expected: FAIL — cannot find module `../src/codegen/typed-t-file.js`.

- [ ] **Step 3: Implement `renderTypedTFile`**

Create `packages/core/src/codegen/typed-t-file.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/codegen-typed-t.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/codegen/typed-t-file.ts packages/core/test/codegen-typed-t.test.ts
git commit -m "feat(core): render typed useTypedT wrapper"
```

---

### Task 6: Export new core API

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the exports**

In `packages/core/src/index.ts`, append:

```ts
export { DICTIONARY_QUERY } from './edge/query.js';
export type { DictionaryEntry } from './edge/client.js';
export { buildDictionary, type DictionaryBuildResult } from './dictionary/build.js';
export { renderDictionaryFile } from './codegen/dictionary-file.js';
export { renderTypedTFile } from './codegen/typed-t-file.js';
```

- [ ] **Step 2: Verify the package compiles / tests still pass**

Run: `npm test`
Expected: PASS (no behavior change; this only widens the public surface).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export dictionary query, builder, and renderers"
```

---

### Task 7: CLI args — add `dictionary` command

**Files:**
- Modify: `packages/cli/src/args.ts`
- Test: `packages/cli/test/args.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/test/args.test.ts` inside the `describe('parseArgs', …)` block:

```ts
it('parses the dictionary command with flags', () => {
  expect(parseArgs(['dictionary', '--lang', 'da', '--dry-run', '--force'])).toEqual({
    command: 'dictionary', name: undefined, route: undefined,
    lang: 'da', dryRun: true, force: true, variants: [],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/cli/test/args.test.ts`
Expected: FAIL — `unknown command "dictionary"` is thrown.

- [ ] **Step 3: Update `args.ts`**

In `packages/cli/src/args.ts`:

Change the `command` field type:

```ts
  command: 'inspect' | 'component' | 'page' | 'dictionary';
```

Update the `USAGE` string to add a line:

```ts
  sitecore-scaffold dictionary [--lang <lang>] [--dry-run] [--force]
```

Update the unknown-command guard:

```ts
  if (command !== 'inspect' && command !== 'component' && command !== 'page' && command !== 'dictionary') {
    throw new Error(`unknown command "${command}"\n${USAGE}`);
  }
```

Update the route-as-positional branch to include `dictionary`:

```ts
  if (command === 'inspect' || command === 'page' || command === 'dictionary') {
    return { command, name: undefined, route: positionals[0], lang, dryRun, force, variants };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/cli/test/args.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/args.ts packages/cli/test/args.test.ts
git commit -m "feat(cli): parse the dictionary command"
```

---

### Task 8: CLI `commands/dictionary.ts` — `runDictionary`

**Files:**
- Create: `packages/cli/src/commands/dictionary.ts`
- Test: `packages/cli/test/dictionary-command.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/dictionary-command.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDictionary } from '../src/commands/dictionary.js';

function makeConfig(i18nPath: string) {
  return {
    edge: { endpoint: 'https://e', apiKey: 'k', site: 's', defaultLanguage: 'en' },
    componentPath: 'src/components', componentFolder: false, componentPropsImport: 'lib/component-props',
    sitecorePackage: '@sitecore-content-sdk/nextjs', useDatasourceCheck: true, generateMocks: true,
    styling: 'none', fieldTypeOverrides: {}, i18nPath, i18nPackage: 'next-localization',
  };
}

const entries = [
  { key: 'Nav.Login', value: 'Log in' },
  { key: 'Home.Title', value: 'Home' },
];

function deps(config: ReturnType<typeof makeConfig>, dict = entries) {
  return { loadConfig: vi.fn().mockResolvedValue(config), getDictionary: vi.fn().mockResolvedValue(dict) };
}

describe('runDictionary', () => {
  it('writes the keys file and the wrapper, sorted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-dict-'));
    const i18n = join(dir, 'i18n');
    const result = await runDictionary({ lang: undefined, dryRun: false, force: false }, deps(makeConfig(i18n)));

    expect(result.warnings).toEqual([]);
    const keysFile = readFileSync(join(i18n, 'dictionary-keys.ts'), 'utf8');
    expect(keysFile.indexOf("'Home.Title'")).toBeLessThan(keysFile.indexOf("'Nav.Login'"));
    expect(existsSync(join(i18n, 'use-typed-t.ts'))).toBe(true);
  });

  it('always overwrites the keys file but preserves a customized wrapper', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-dict-keep-'));
    const i18n = join(dir, 'i18n');
    mkdirSync(i18n, { recursive: true });
    writeFileSync(join(i18n, 'dictionary-keys.ts'), '// stale', 'utf8');
    writeFileSync(join(i18n, 'use-typed-t.ts'), '// hand-edited', 'utf8');

    await runDictionary({ lang: undefined, dryRun: false, force: false }, deps(makeConfig(i18n)));

    expect(readFileSync(join(i18n, 'dictionary-keys.ts'), 'utf8')).not.toBe('// stale');
    expect(readFileSync(join(i18n, 'use-typed-t.ts'), 'utf8')).toBe('// hand-edited');
  });

  it('overwrites the wrapper with --force', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-dict-force-'));
    const i18n = join(dir, 'i18n');
    mkdirSync(i18n, { recursive: true });
    writeFileSync(join(i18n, 'use-typed-t.ts'), '// hand-edited', 'utf8');

    await runDictionary({ lang: undefined, dryRun: false, force: true }, deps(makeConfig(i18n)));

    expect(readFileSync(join(i18n, 'use-typed-t.ts'), 'utf8')).not.toBe('// hand-edited');
  });

  it('dry-run previews both files and writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-dict-dry-'));
    const i18n = join(dir, 'i18n');
    const result = await runDictionary({ lang: undefined, dryRun: true, force: false }, deps(makeConfig(i18n)));

    expect(result.files.map((f) => f.path.split(/[\\/]/).pop()).sort())
      .toEqual(['dictionary-keys.ts', 'use-typed-t.ts']);
    expect(existsSync(join(i18n, 'dictionary-keys.ts'))).toBe(false);
  });

  it('surfaces a warning for an empty dictionary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-dict-empty-'));
    const result = await runDictionary(
      { lang: undefined, dryRun: true, force: false },
      deps(makeConfig(join(dir, 'i18n')), []),
    );
    expect(result.warnings.join('\n')).toMatch(/no dictionary entries/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/cli/test/dictionary-command.test.ts`
Expected: FAIL — cannot find module `../src/commands/dictionary.js`.

- [ ] **Step 3: Implement `runDictionary`**

Create `packages/cli/src/commands/dictionary.ts`:

```ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  loadConfig as defaultLoadConfig,
  EdgeClient,
  buildDictionary,
  renderDictionaryFile,
  renderTypedTFile,
  type DictionaryEntry,
  type GeneratedFile,
} from '@sitecore-scaffold/core';

export interface DictionaryDeps {
  loadConfig: typeof defaultLoadConfig;
  getDictionary: (lang: string) => Promise<DictionaryEntry[]>;
}

export interface DictionaryInput {
  lang: string | undefined;
  dryRun: boolean;
  force: boolean;
}

export interface DictionaryFileResult extends GeneratedFile {
  /** Whether this file is rewritten on every run, or scaffolded once. */
  mode: 'overwrite' | 'scaffold';
  status: 'generated' | 'skipped';
}

export interface DictionaryResult {
  files: DictionaryFileResult[];
  warnings: string[];
}

const CONFIG_PATH = `${process.cwd()}/sitecore-scaffold.config.ts`;

export async function runDictionary(input: DictionaryInput, deps?: Partial<DictionaryDeps>): Promise<DictionaryResult> {
  const loadConfig = deps?.loadConfig ?? defaultLoadConfig;
  const config = await loadConfig(CONFIG_PATH);
  const lang = input.lang ?? config.edge.defaultLanguage;

  const getDictionary = deps?.getDictionary ?? ((l: string) => new EdgeClient(config.edge).getDictionary(l));
  const entries = await getDictionary(lang);
  const { keys, warnings } = buildDictionary(entries);

  const keysPath = `${config.i18nPath}/dictionary-keys.ts`;
  const wrapperPath = `${config.i18nPath}/use-typed-t.ts`;

  const files: DictionaryFileResult[] = [
    { path: keysPath, contents: renderDictionaryFile(keys), mode: 'overwrite', status: 'generated' },
    { path: wrapperPath, contents: renderTypedTFile(config.i18nPackage), mode: 'scaffold', status: 'generated' },
  ];

  if (input.dryRun) return { files, warnings };

  for (const file of files) {
    // The wrapper is scaffolded once; never clobber a customized one unless --force.
    if (file.mode === 'scaffold' && !input.force && existsSync(file.path)) {
      file.status = 'skipped';
      continue;
    }
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.contents, 'utf8');
  }

  return { files, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/cli/test/dictionary-command.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/dictionary.ts packages/cli/test/dictionary-command.test.ts
git commit -m "feat(cli): runDictionary generates keys (overwrite) and wrapper (scaffold)"
```

---

### Task 9: CLI dispatch + summary output

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add the import**

In `packages/cli/src/index.ts`, add to the command imports:

```ts
import { runDictionary } from './commands/dictionary.js';
```

- [ ] **Step 2: Add the dispatch block**

In `packages/cli/src/index.ts`, add after the `if (args.command === 'page') { … }` block (before the final `runComponent` call):

```ts
  if (args.command === 'dictionary') {
    const result = await runDictionary({ lang: args.lang, dryRun: args.dryRun, force: args.force });

    if (args.dryRun) {
      for (const f of result.files) process.stdout.write(`\n--- ${f.path} ---\n${f.contents}`);
      return;
    }

    process.stdout.write('Dictionary types generated:\n');
    for (const f of result.files) {
      const note = f.status === 'skipped' ? ' (skipped, already exists — use --force)' : '';
      process.stdout.write(`  ${f.path}${note}\n`);
    }
    if (result.warnings.length > 0) {
      process.stdout.write('\nWarnings:\n');
      for (const w of result.warnings) process.stdout.write(`  ${w}\n`);
    }
    return;
  }
```

- [ ] **Step 3: Verify the whole suite passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): dispatch dictionary command and print summary"
```

---

### Task 10: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the command**

In `README.md`, under `## Commands`, add the command to the usage list:

```
    sitecore-scaffold dictionary [--lang <lang>] [--dry-run] [--force]
```

And add a new section after the `page` description:

```markdown
`dictionary` fetches the site dictionary from Experience Edge and generates
type-safe translations into `<i18nPath>` (default `src/lib/i18n`):

- `dictionary-keys.ts` — a `dictionaryKeys` const map and a `DictionaryKey` type.
  This file is **always overwritten** so it tracks the live dictionary; re-run the
  command whenever entries are added or removed.
- `use-typed-t.ts` — a `useTypedT()` hook wrapping `useI18n().t` (from the
  `i18nPackage`, default `next-localization`) with keys constrained to
  `DictionaryKey`. This file is **scaffolded once** and skipped if it exists
  (pass `--force` to regenerate it).

Use it at call sites as:

    const t = useTypedT();
    t(dictionaryKeys['Nav.Login']); // autocompleted; unknown keys are type errors
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document the dictionary command"
```

---

## Self-Review

**Spec coverage:**
- Data source = Edge dictionary query → Task 2. ✓
- Standalone `dictionary` command → Tasks 7–9. ✓
- next-localization typed wrapper → Tasks 5, 8. ✓
- Const map + derived type → Task 4. ✓
- Idempotent rebuild (keys overwrite, wrapper scaffold-once) → Task 8. ✓
- Config `i18nPath` / `i18nPackage` → Task 1. ✓
- Quoted keys / special chars → Task 4 (escape test). ✓
- Empty dictionary warning → Tasks 3, 8. ✓
- Pagination → Task 2. ✓
- Tests for build/codegen/client/command → Tasks 2–8. ✓

**Type consistency:** `DictionaryEntry` (Task 2) is consumed by `buildDictionary` (Task 3) and `runDictionary` (Task 8); `renderDictionaryFile(keys: string[])` and `renderTypedTFile(i18nPackage: string)` signatures match their call sites; `i18nPath`/`i18nPackage` names are identical across Tasks 1, 8. ✓

**Placeholders:** none.
