# `page <route>` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `sitecore-scaffold page <route>` command that scaffolds every component on a route in one pass, deduping component types and merging their inferred field shapes across instances.

**Architecture:** A new pure core primitive `mergeContracts` unions field contracts across multiple instances of one component type. A shared `collectRenderings` helper is lifted into core and reused. A thin CLI `runPage` orchestrates fetch → parse → collect → group → merge → generate, writing files with skip-existing semantics (mirrors `runComponent`).

**Tech Stack:** TypeScript, Node ESM, Vitest, tsup. Monorepo: `packages/core` (inference/codegen, no FS) and `packages/cli` (orchestration + FS).

---

## File Structure

- `packages/core/src/inspect/collect.ts` — **new.** `collectRenderings(tree)` → flat `RenderingNode[]`.
- `packages/core/src/contract/merge.ts` — **new.** `mergeContracts(nodes, overrides)` → `{ contract, warnings }`.
- `packages/core/src/index.ts` — export the two new functions.
- `packages/cli/src/commands/component.ts` — drop its private `collectRenderings`, import the shared one.
- `packages/cli/src/commands/page.ts` — **new.** `runPage`.
- `packages/cli/src/args.ts` — add `'page'` command + USAGE line.
- `packages/cli/src/index.ts` — dispatch `page`, print summary.
- Tests: `packages/core/test/inspect-collect.test.ts`, `packages/core/test/contract-merge.test.ts`, `packages/cli/test/page-command.test.ts`, plus additions to `packages/cli/test/args.test.ts`.

Run all tests with: `npx vitest run` (from repo root).

---

## Task 1: Shared `collectRenderings` in core

**Files:**
- Create: `packages/core/src/inspect/collect.ts`
- Create: `packages/core/test/inspect-collect.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/inspect-collect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectRenderings } from '../src/inspect/collect.js';
import type { RenderingTree } from '../src/types.js';

const tree: RenderingTree = {
  route: '/x',
  placeholders: {
    'headless-main': [
      {
        componentName: 'Hero', params: {}, fields: {},
        placeholders: {
          inner: [{ componentName: 'Card', params: {}, fields: {}, placeholders: {} }],
        },
      },
      { componentName: 'Card', params: {}, fields: {}, placeholders: {} },
    ],
  },
};

describe('collectRenderings', () => {
  it('returns every rendering depth-first, including nested ones', () => {
    const names = collectRenderings(tree).map((n) => n.componentName);
    expect(names).toEqual(['Hero', 'Card', 'Card']);
  });

  it('returns an empty array when there are no placeholders', () => {
    expect(collectRenderings({ route: '/x', placeholders: {} })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/inspect-collect.test.ts`
Expected: FAIL — cannot resolve `../src/inspect/collect.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/inspect/collect.ts`:

```ts
import type { RenderingNode, RenderingTree } from '../types.js';

/** Flattens a parsed layout tree into every rendering it contains, depth-first. */
export function collectRenderings(tree: RenderingTree): RenderingNode[] {
  const acc: RenderingNode[] = [];
  const walk = (placeholders: Record<string, RenderingNode[]>): void => {
    for (const renderings of Object.values(placeholders)) {
      for (const node of renderings) {
        acc.push(node);
        walk(node.placeholders);
      }
    }
  };
  walk(tree.placeholders);
  return acc;
}
```

- [ ] **Step 4: Export from core index**

Add to `packages/core/src/index.ts` (after the `parseLayout` export):

```ts
export { collectRenderings } from './inspect/collect.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/core/test/inspect-collect.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/inspect/collect.ts packages/core/test/inspect-collect.test.ts packages/core/src/index.ts
git commit -m "feat(core): add shared collectRenderings tree-flatten helper"
```

---

## Task 2: Refactor `component.ts` to use shared `collectRenderings`

**Files:**
- Modify: `packages/cli/src/commands/component.ts`

- [ ] **Step 1: Replace the private helper with the shared import**

In `packages/cli/src/commands/component.ts`, add `collectRenderings` to the existing core import block:

```ts
import {
  loadConfig as defaultLoadConfig,
  EdgeClient,
  parseLayout,
  collectRenderings,
  buildContract,
  generateFiles,
  normalizeVariants,
  type RenderingNode,
  type GeneratedFile,
} from '@sitecore-scaffold/core';
```

Delete the private `collectRenderings` function (the `function collectRenderings(placeholders, acc) { … }` block).

Change the collection call from:

```ts
  const all: RenderingNode[] = [];
  collectRenderings(tree.placeholders, all);
```

to:

```ts
  const all = collectRenderings(tree);
```

- [ ] **Step 2: Run the existing component tests to verify no regression**

Run: `npx vitest run packages/cli/test/component-command.test.ts`
Expected: PASS (all existing tests, including the `ambiguous` one).

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/component.ts
git commit -m "refactor(cli): use shared collectRenderings in component command"
```

---

## Task 3: `mergeContracts` core primitive

**Files:**
- Create: `packages/core/src/contract/merge.ts`
- Create: `packages/core/test/contract-merge.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/contract-merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeContracts } from '../src/contract/merge.js';
import type { RenderingNode } from '../src/types.js';

function node(fields: Record<string, unknown>, extra: Partial<RenderingNode> = {}): RenderingNode {
  return { componentName: 'Card', params: {}, fields, placeholders: {}, ...extra };
}

describe('mergeContracts', () => {
  it('marks a field optional when it is absent from some instances', () => {
    const { contract } = mergeContracts(
      [node({ heading: { value: 'A' } }), node({ heading: { value: 'B' }, subtitle: { value: 'S' } })],
      {},
    );
    const subtitle = contract.fields.find((f) => f.name === 'subtitle')!;
    expect(subtitle.optional).toBe(true);
    expect(contract.fields.find((f) => f.name === 'heading')!.optional).toBe(false);
  });

  it('lets a concrete renderer win over an empty value, and marks it optional', () => {
    const { contract } = mergeContracts(
      [node({ heading: { value: '' } }), node({ heading: { value: 'Hello' } })],
      {},
    );
    const heading = contract.fields.find((f) => f.name === 'heading')!;
    expect(heading.renderer).toBe('Text');
    expect(heading.optional).toBe(true);
  });

  it('prefers RichText over Text when HTML appears on any instance', () => {
    const { contract } = mergeContracts(
      [node({ body: { value: 'plain' } }), node({ body: { value: '<p>rich</p>' } })],
      {},
    );
    expect(contract.fields.find((f) => f.name === 'body')!.renderer).toBe('RichText');
  });

  it('falls back to Field<string> raw and warns on a hard renderer conflict', () => {
    const { contract, warnings } = mergeContracts(
      [
        node({ media: { value: { src: 'a.jpg' } } }),
        node({ media: { value: { href: '/x' } } }),
      ],
      {},
    );
    const media = contract.fields.find((f) => f.name === 'media')!;
    expect(media.tsType).toBe('Field<string>');
    expect(media.renderer).toBe('raw');
    expect(warnings.join('\n')).toMatch(/Card\.media.*conflicting/i);
  });

  it('unions params and placeholders across instances', () => {
    const { contract } = mergeContracts(
      [
        node({}, { params: { variant: 'a' }, placeholders: { left: [] } }),
        node({}, { params: { color: 'b' }, placeholders: { right: [] } }),
      ],
      {},
    );
    expect(contract.params.sort()).toEqual(['color', 'variant']);
    expect(contract.placeholders.sort()).toEqual(['left', 'right']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/contract-merge.test.ts`
Expected: FAIL — cannot resolve `../src/contract/merge.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/contract/merge.ts`:

```ts
import type { ComponentContract, FieldContract, FieldRenderer, RenderingNode } from '../types.js';
import { buildContract } from './build.js';

export interface MergeResult {
  contract: ComponentContract;
  warnings: string[];
}

const SPECIFICITY: Record<FieldRenderer, number> = {
  raw: 0,
  Text: 1,
  RichText: 2,
  Image: 2,
  Link: 2,
  Cards: 2,
};

/** Merge the FieldContracts inferred for one field name across instances. */
function mergeField(
  componentName: string,
  fieldName: string,
  variants: FieldContract[],
  warnings: string[],
): FieldContract {
  const maxSpec = Math.max(...variants.map((v) => SPECIFICITY[v.renderer]));
  const candidates = variants.filter((v) => SPECIFICITY[v.renderer] === maxSpec);
  const distinctRenderers = [...new Set(candidates.map((v) => v.renderer))];

  let merged: FieldContract;
  if (maxSpec === 0) {
    // All instances are bare raw Field<string>.
    merged = { ...variants[0] };
  } else if (distinctRenderers.length > 1) {
    // Hard conflict, e.g. Image vs Link for the same field.
    warnings.push(
      `${componentName}.${fieldName}: conflicting types across instances (${distinctRenderers.join(' vs ')}) — emitted Field<string>`,
    );
    merged = { name: fieldName, tsType: 'Field<string>', optional: false, renderer: 'raw', sitecoreImport: null };
  } else {
    merged = { ...candidates[0] };
    if (merged.renderer === 'Cards') {
      merged = { ...merged, itemFields: mergeItemFields(componentName, fieldName, candidates, warnings) };
    }
  }

  // Optional if missing from any instance, or empty on any instance that had it.
  if (variants.some((v) => v.optional)) merged.optional = true;
  return merged;
}

/** Recursively merge the inner itemFields of Cards instances. */
function mergeItemFields(
  componentName: string,
  fieldName: string,
  cardsVariants: FieldContract[],
  warnings: string[],
): FieldContract[] {
  const byName = new Map<string, FieldContract[]>();
  const order: string[] = [];
  for (const v of cardsVariants) {
    for (const item of v.itemFields ?? []) {
      if (!byName.has(item.name)) { byName.set(item.name, []); order.push(item.name); }
      byName.get(item.name)!.push(item);
    }
  }
  return order.map((n) => {
    const merged = mergeField(`${componentName}.${fieldName}`, n, byName.get(n)!, warnings);
    if (byName.get(n)!.length < cardsVariants.length) merged.optional = true;
    return merged;
  });
}

function unionKeys(lists: string[][]): string[] {
  const seen: string[] = [];
  for (const list of lists) for (const k of list) if (!seen.includes(k)) seen.push(k);
  return seen;
}

/** Merge all instances of one component type into a single contract. */
export function mergeContracts(
  nodes: RenderingNode[],
  overrides: Record<string, string>,
): MergeResult {
  const name = nodes[0].componentName;
  const contracts = nodes.map((n) => buildContract(n, overrides));
  const warnings: string[] = [];

  const byField = new Map<string, FieldContract[]>();
  const order: string[] = [];
  for (const c of contracts) {
    for (const f of c.fields) {
      if (!byField.has(f.name)) { byField.set(f.name, []); order.push(f.name); }
      byField.get(f.name)!.push(f);
    }
  }

  const total = contracts.length;
  const fields = order.map((fname) => {
    const variants = byField.get(fname)!;
    const merged = mergeField(name, fname, variants, warnings);
    if (variants.length < total) merged.optional = true;
    return merged;
  });

  return {
    contract: {
      name,
      fields,
      params: unionKeys(contracts.map((c) => c.params)),
      placeholders: unionKeys(contracts.map((c) => c.placeholders)),
    },
    warnings,
  };
}
```

- [ ] **Step 4: Export from core index**

Add to `packages/core/src/index.ts` (after the `buildContract` export):

```ts
export { mergeContracts, type MergeResult } from './contract/merge.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/core/test/contract-merge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/contract/merge.ts packages/core/test/contract-merge.test.ts packages/core/src/index.ts
git commit -m "feat(core): add mergeContracts to union field shapes across instances"
```

---

## Task 4: `page` arg parsing

**Files:**
- Modify: `packages/cli/src/args.ts`
- Modify: `packages/cli/test/args.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/test/args.test.ts` inside the `describe('parseArgs', …)` block:

```ts
  it('parses page command with route as a positional', () => {
    expect(parseArgs(['page', '/about-us', '--lang', 'da', '--dry-run'])).toEqual({
      command: 'page', name: undefined, route: '/about-us', lang: 'da', dryRun: true, force: false, variants: [],
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/cli/test/args.test.ts`
Expected: FAIL — `parseArgs` throws `unknown command "page"`.

- [ ] **Step 3: Update `args.ts`**

In `packages/cli/src/args.ts`:

Change the `command` field type:

```ts
  command: 'inspect' | 'component' | 'page';
```

Update the USAGE constant to add a `page` line:

```ts
const USAGE = `usage:
  sitecore-scaffold inspect <route>
  sitecore-scaffold page <route> [--lang <lang>] [--dry-run] [--force]
  sitecore-scaffold component <Name> --route <route> [--lang <lang>] [--variants <A,B,C>] [--dry-run] [--force]`;
```

Update the command guard:

```ts
  if (command !== 'inspect' && command !== 'component' && command !== 'page') {
    throw new Error(`unknown command "${command}"\n${USAGE}`);
  }
```

Add a `page` return branch (route is the first positional, like `inspect`). Place it just before the `inspect` branch return:

```ts
  if (command === 'inspect' || command === 'page') {
    return { command, name: undefined, route: positionals[0], lang, dryRun, force, variants };
  }
  return { command, name: positionals[0], route, lang, dryRun, force, variants };
```

(Delete the old standalone `if (command === 'inspect')` block — it is replaced by the combined branch above.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/test/args.test.ts`
Expected: PASS (all existing tests plus the new `page` test).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/args.ts packages/cli/test/args.test.ts
git commit -m "feat(cli): parse page <route> command"
```

---

## Task 5: `runPage` command

**Files:**
- Create: `packages/cli/src/commands/page.ts`
- Create: `packages/cli/test/page-command.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/page-command.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPage } from '../src/commands/page.js';

const rendered = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../core/test/fixtures/about-us-layout.json', import.meta.url)), 'utf8'),
);

function makeConfig(componentPath: string) {
  return {
    edge: { endpoint: 'https://e', apiKey: 'k', site: 's', defaultLanguage: 'en' },
    componentPath, componentFolder: false, componentPropsImport: 'lib/component-props',
    sitecorePackage: '@sitecore-content-sdk/nextjs', useDatasourceCheck: true, generateMocks: true, styling: 'none', fieldTypeOverrides: {},
  };
}

function deps(config: ReturnType<typeof makeConfig>, layout: unknown = rendered) {
  return { loadConfig: vi.fn().mockResolvedValue(config), getLayout: vi.fn().mockResolvedValue(layout) };
}

describe('runPage', () => {
  it('generates one component per unique type on the route', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-page-'));
    const config = makeConfig(join(dir, 'components'));
    const result = await runPage({ route: '/about-us', lang: undefined, dryRun: false, force: false }, deps(config));

    // collectRenderings is recursive, so the nested Card rendering is included too.
    const names = result.components.map((c) => c.name).sort();
    expect(names).toEqual(['Card', 'Hero', 'PromoCards']);
    expect(result.components.every((c) => c.status === 'generated')).toBe(true);
    expect(existsSync(join(dir, 'components', 'Hero.tsx'))).toBe(true);
    expect(existsSync(join(dir, 'components', 'PromoCards.tsx'))).toBe(true);
    expect(existsSync(join(dir, 'components', 'Card.tsx'))).toBe(true);
  });

  it('dedupes repeated component types into a single generated component', async () => {
    const layout = {
      sitecore: {
        context: { pageState: 'normal', language: 'en' },
        route: {
          name: 'test',
          placeholders: {
            'headless-main': [
              { uid: 'c1', componentName: 'Card', params: {}, fields: { heading: { value: 'One' } }, placeholders: {} },
              { uid: 'c2', componentName: 'Card', params: {}, fields: { heading: { value: 'Two' }, badge: { value: 'New' } }, placeholders: {} },
            ],
          },
        },
      },
    };
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-page-dup-'));
    const config = makeConfig(join(dir, 'components'));
    const result = await runPage({ route: '/test', lang: undefined, dryRun: false, force: false }, deps(config, layout));

    expect(result.components.length).toBe(1);
    const card = result.components[0];
    expect(card.name).toBe('Card');
    expect(card.instanceCount).toBe(2);
    // `badge` only appears on the second instance, so it is optional.
    expect(readFileSync(join(dir, 'components', 'Card.types.ts'), 'utf8')).toMatch(/badge\?:/);
  });

  it('skips components whose files already exist and reports them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-page-skip-'));
    const config = makeConfig(join(dir, 'components'));
    mkdirSync(join(dir, 'components'), { recursive: true });
    writeFileSync(join(dir, 'components', 'Hero.tsx'), '// hand-edited', 'utf8');

    const result = await runPage({ route: '/about-us', lang: undefined, dryRun: false, force: false }, deps(config));

    const hero = result.components.find((c) => c.name === 'Hero')!;
    expect(hero.status).toBe('skipped');
    expect(readFileSync(join(dir, 'components', 'Hero.tsx'), 'utf8')).toBe('// hand-edited');
  });

  it('overwrites existing files with --force', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-page-force-'));
    const config = makeConfig(join(dir, 'components'));
    mkdirSync(join(dir, 'components'), { recursive: true });
    writeFileSync(join(dir, 'components', 'Hero.tsx'), '// hand-edited', 'utf8');

    const result = await runPage({ route: '/about-us', lang: undefined, dryRun: false, force: true }, deps(config));

    expect(result.components.find((c) => c.name === 'Hero')!.status).toBe('generated');
    expect(readFileSync(join(dir, 'components', 'Hero.tsx'), 'utf8')).not.toBe('// hand-edited');
  });

  it('dry-run previews every component and writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-page-dry-'));
    const config = makeConfig(join(dir, 'components'));
    const result = await runPage({ route: '/about-us', lang: undefined, dryRun: true, force: false }, deps(config));

    expect(result.components.every((c) => c.status === 'generated')).toBe(true);
    expect(result.components.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'components', 'Hero.tsx'))).toBe(false);
  });

  it('throws when the route argument is missing', async () => {
    await expect(
      runPage({ route: undefined, lang: undefined, dryRun: false, force: false }, deps(makeConfig('/tmp/never'))),
    ).rejects.toThrow(/route/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/cli/test/page-command.test.ts`
Expected: FAIL — cannot resolve `../src/commands/page.js`.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/commands/page.ts`:

```ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  loadConfig as defaultLoadConfig,
  EdgeClient,
  parseLayout,
  collectRenderings,
  mergeContracts,
  generateFiles,
  type RenderingNode,
  type GeneratedFile,
} from '@sitecore-scaffold/core';
import type { InspectDeps } from './inspect.js';

export interface PageInput {
  route: string | undefined;
  lang: string | undefined;
  dryRun: boolean;
  force: boolean;
}

export interface PageComponentResult {
  name: string;
  instanceCount: number;
  status: 'generated' | 'skipped';
  files: GeneratedFile[];
}

export interface PageResult {
  route: string;
  components: PageComponentResult[];
  warnings: string[];
}

const CONFIG_PATH = `${process.cwd()}/sitecore-scaffold.config.ts`;

export async function runPage(input: PageInput, deps?: Partial<InspectDeps>): Promise<PageResult> {
  if (!input.route) throw new Error('page requires a <route> argument');

  const loadConfig = deps?.loadConfig ?? defaultLoadConfig;
  const config = await loadConfig(CONFIG_PATH);
  const lang = input.lang ?? config.edge.defaultLanguage;

  const getLayout = deps?.getLayout ?? ((route: string, l: string) => new EdgeClient(config.edge).getLayout(route, l));
  const rendered = await getLayout(input.route, lang);
  const tree = parseLayout(rendered, input.route);

  const groups = new Map<string, RenderingNode[]>();
  for (const node of collectRenderings(tree)) {
    if (!groups.has(node.componentName)) groups.set(node.componentName, []);
    groups.get(node.componentName)!.push(node);
  }

  const codegenConfig = {
    componentPath: config.componentPath,
    componentFolder: config.componentFolder,
    componentPropsImport: config.componentPropsImport,
    sitecorePackage: config.sitecorePackage,
    useDatasourceCheck: config.useDatasourceCheck,
    generateMocks: config.generateMocks,
    styling: config.styling,
    fieldTypeOverrides: config.fieldTypeOverrides,
  };

  const components: PageComponentResult[] = [];
  const warnings: string[] = [];

  for (const [name, nodes] of groups) {
    const merged = mergeContracts(nodes, config.fieldTypeOverrides);
    warnings.push(...merged.warnings);
    const files = generateFiles(merged.contract, nodes[0], codegenConfig);

    if (input.dryRun) {
      components.push({ name, instanceCount: nodes.length, status: 'generated', files });
      continue;
    }

    if (!input.force && files.some((f) => existsSync(f.path))) {
      components.push({ name, instanceCount: nodes.length, status: 'skipped', files });
      continue;
    }

    for (const file of files) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.contents, 'utf8');
    }
    components.push({ name, instanceCount: nodes.length, status: 'generated', files });
  }

  return { route: input.route, components, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/test/page-command.test.ts`
Expected: PASS (6 tests).

> If the `dedupes` test's `badge\?:` assertion fails, confirm `renderTypesFile` emits `name?:` for optional fields (it does for `component`'s optional fields); adjust the regex to match the actual optional syntax if the generator differs.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/page.ts packages/cli/test/page-command.test.ts
git commit -m "feat(cli): add runPage to scaffold every component on a route"
```

---

## Task 6: Wire `page` into the CLI entrypoint

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Import and dispatch `runPage`**

In `packages/cli/src/index.ts`, add the import:

```ts
import { runPage } from './commands/page.js';
```

Add a `page` dispatch block after the existing `inspect` block (before the `runComponent` call):

```ts
  if (args.command === 'page') {
    const result = await runPage({ route: args.route, lang: args.lang, dryRun: args.dryRun, force: args.force });

    if (args.dryRun) {
      for (const c of result.components) {
        for (const f of c.files) process.stdout.write(`\n--- ${f.path} ---\n${f.contents}`);
      }
      return;
    }

    process.stdout.write(`Page ${result.route} — ${result.components.length} component type(s) found\n\n`);
    const generated = result.components.filter((c) => c.status === 'generated');
    const skipped = result.components.filter((c) => c.status === 'skipped');

    if (generated.length > 0) {
      process.stdout.write('Generated:\n');
      for (const c of generated) {
        const merged = c.instanceCount > 1 ? `   [merged from ${c.instanceCount} instances]` : '';
        process.stdout.write(`  ${c.name} (${c.files.length} file(s))${merged}\n`);
      }
    }
    if (skipped.length > 0) {
      process.stdout.write('Skipped (already exist, use --force):\n');
      for (const c of skipped) process.stdout.write(`  ${c.name}\n`);
    }
    if (result.warnings.length > 0) {
      process.stdout.write('\nWarnings:\n');
      for (const w of result.warnings) process.stdout.write(`  ${w}\n`);
    }
    return;
  }
```

- [ ] **Step 2: Build the CLI to confirm it compiles**

Run: `npx tsup --config packages/cli/tsup.config.ts` (or the repo's build script, e.g. `npm run build -w @sitecore-scaffold/cli` if defined)
Expected: build succeeds with no type errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all suites, including the new ones).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): dispatch page command and print per-component summary"
```

---

## Task 7: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the `page` command**

In `README.md` under `## Commands`, add the `page` line to the command list:

```
    sitecore-scaffold page <route> [--lang <lang>] [--dry-run] [--force]
```

And add a short paragraph after the `component` description:

```
`page` scaffolds **every** component on a route in one pass. It dedupes
component types and merges inferred field shapes across all instances (a field
missing or empty on some instances becomes optional; the most specific renderer
wins; hard type conflicts fall back to `Field<string>` with a warning). Files
that already exist are skipped unless `--force` is passed. `--variants` is not
supported here — scaffold the page, then re-run `component <Name> --variants …`
for a component you want to split.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document the page command"
```

---

## Self-Review Notes

- **Spec coverage:** CLI surface (Task 4), `mergeContracts` rules incl. presence/most-specific/RichText/hard-conflict/Cards/params-placeholders (Task 3), `runPage` orchestration + skip-existing + dry-run (Task 5), reporting (Task 6), shared `collectRenderings` (Tasks 1–2), README (Task 7). All spec sections are covered.
- **Type consistency:** `mergeContracts(nodes, overrides) → { contract, warnings }` used identically in Task 3 and Task 5. `PageResult`/`PageComponentResult` fields (`name`, `instanceCount`, `status`, `files`) match between Task 5 definition and Task 6 consumption. `collectRenderings(tree)` signature matches across Tasks 1, 2, 5.
- **Fixture assumption:** Tests use the existing `about-us-layout.json` fixture, which contains three rendering types — `Hero` and `PromoCards` at the top level plus a nested `Card` rendering (verified via `grep "componentName"` on the fixture). Because `collectRenderings` recurses, `runPage` sees all three; the Task 5 first test asserts `['Card', 'Hero', 'PromoCards']`.
```
