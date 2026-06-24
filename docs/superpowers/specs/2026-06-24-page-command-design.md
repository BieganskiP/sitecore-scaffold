# Design: `page <route>` command

## Summary

Add a third CLI command, `page <route>`, that scaffolds **every** component on a
route in one pass. Instead of naming a single rendering (`component <Name>
--route <route>`), the user supplies only the route; the tool inspects the
layout, collects all renderings, dedupes them by component type, merges the
inferred field shapes across instances, and generates one component per type.

This reuses the machinery `component` already relies on — `getLayout`,
`parseLayout`, `collectRenderings`, `buildContract`/`inferField`, and
`generateFiles`. The only genuinely new logic is merging multiple instances of
the same component type into one contract.

## Goals

- `sitecore-scaffold page /about-us` generates a typed component for every
  rendering on the route.
- Re-running on an evolving page is safe: existing files are skipped, not
  clobbered.
- Field types reflect **all** instances of a component on the page, not just the
  first one encountered.

## Non-goals

- `--variants` is **not** supported on `page`. Variants are a per-component
  authoring decision that cannot be inferred from layout data. Workflow: run
  `page` to scaffold everything, then re-run `component <Name> --variants …` for
  the one component you want to split into variants.
- No cross-page deduplication or shared-component registry. `page` operates on a
  single route.
- No page-level index/manifest file. (YAGNI — can be added later if wanted.)

## CLI surface

```
sitecore-scaffold page <route> [--lang <lang>] [--dry-run] [--force]
```

- `args.ts` gains `'page'` as a third valid command alongside `inspect` and
  `component`.
- For `page`, the route is the first positional (same as `inspect`); `name` is
  unused.
- `--lang`, `--dry-run`, `--force` behave as they do today.
- USAGE text is updated to list the new command.

## Core primitive: `mergeContracts(nodes)`

New pure function in `packages/core` (no filesystem access; fully unit-testable).

**Signature (intent):**

```ts
function mergeContracts(
  nodes: RenderingNode[],            // all instances sharing one componentName
  overrides: Record<string, string>,
): { contract: ComponentContract; warnings: string[] };
```

**Field merge rules** (applied per field name across all instances):

1. Infer a `FieldContract` from each instance that contains the field, using the
   existing `inferField`.
2. **Presence:** if the field is absent from any instance, the merged field is
   `optional: true`. If present (and non-empty) on every instance, keep the
   inferred `optional`.
3. **Renderer conflict — prefer the most specific:**
   - A concrete renderer (`Text`, `RichText`, `Image`, `Link`, `Cards`) beats the
     bare optional `raw` `Field<string>` that empty/missing values produce.
   - `RichText` beats `Text` — if HTML is detected on *any* instance, the field
     is `RichText`.
4. **Hard conflict** (two different concrete renderers for the same field name,
   e.g. `Image` on one instance and `Link` on another): fall back to
   `Field<string>` with `renderer: 'raw'`, and append a warning string
   (`"<Component>.<field>: conflicting types across instances (Image vs Link) — emitted Field<string>"`).
5. **`Cards` items:** when the winning renderer is `Cards`, recursively merge the
   `itemFields` across the instances that produced `Cards`, using the same rules.

**Params / placeholders:** union of keys across all instances.

The merged contract's `name` is the shared `componentName`.

## `runPage` orchestration (CLI)

Lives in `packages/cli/src/commands/page.ts`, mirroring `runComponent`. Uses the
same `InspectDeps` injection pattern (`loadConfig`, `getLayout`) so it is
testable without network or filesystem.

Steps:

1. Require `route`; load config; resolve `lang`.
2. `getLayout(route, lang)` → `parseLayout(rendered, route)`.
3. Collect all renderings via the shared `collectRenderings` helper.
4. Group nodes by `componentName`.
5. For each group: `mergeContracts(group, overrides)` → `generateFiles(contract,
   representativeNode, options)`. The representative node (first instance) drives
   markup/placeholder scaffolding; the merged contract drives types.
6. **Skip-existing:** if `--force` is off and any of a component's target files
   already exist on disk, skip that whole component and record it as skipped.
   Otherwise write all its files (`mkdirSync` + `writeFileSync`, as today).
7. **`--dry-run`:** produce previews for every component; perform no writes and no
   skip checks.

`collectRenderings` currently lives privately in `component.ts`. Lift it to a
shared location (export from `core`, or a small CLI util) so both commands use
one implementation.

## Result shape & reporting

`runPage` returns enough structure for `index.ts` to print a per-component
summary:

- generated components (with file count and, when >1 instance, an indication it
  was merged),
- skipped components (already exist),
- aggregated warnings from `mergeContracts`.

Example terminal output:

```
Page /about-us — 5 component types found

Generated:
  Hero        src/components/sitecore/Hero/Hero.tsx (+3)
  Card        src/components/sitecore/Card/Card.tsx (+3)   [merged from 3 instances]
Skipped (already exist, use --force):
  RichText    src/components/sitecore/RichText/

Warnings:
  Card.image: conflicting types across instances (Image vs Link) — emitted Field<string>
```

`--dry-run` instead prints the full previewed contents of every file, matching
the existing `component --dry-run` format.

## Testing

**Core — `mergeContracts` unit tests:**

- field present on some instances but not all → `optional: true`
- empty value on one instance, populated on another → concrete renderer wins,
  field optional
- HTML on one instance, plain text on others → `RichText`
- `Cards` field: inner `itemFields` merged across instances
- hard conflict (`Image` vs `Link`) → `Field<string>` raw + warning emitted
- params/placeholders unioned across instances

**CLI — `runPage` command tests** (injected `getLayout`, same pattern as
`inspect`/`component` tests):

- dedupes: 3 `Card` renderings → one `Card` component generated
- skips files that already exist; reports them; `--force` overwrites
- `--dry-run` previews all components and writes nothing
- empty route argument → error

**Arg parsing:** `page <route>` parses the route as the first positional. The
USAGE text includes the `page` line. `--variants` is not part of `page`'s usage;
if passed it is simply ignored (the parser already tolerates the flag), not an
error.

## Files touched

- `packages/cli/src/args.ts` — add `'page'` command, update USAGE.
- `packages/cli/src/commands/page.ts` — new `runPage`.
- `packages/cli/src/commands/component.ts` — export/extract `collectRenderings`.
- `packages/cli/src/index.ts` — dispatch `page`, print summary.
- `packages/core/src/contract/merge.ts` — new `mergeContracts`.
- `packages/core/src/index.ts` — export `mergeContracts`.
- Tests as listed above.
