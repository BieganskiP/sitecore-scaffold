# Generated-Output Compile Check — Design

Date: 2026-06-22
Status: Approved (pending spec review)

## Problem

The scaffold's tests assert on substrings of generated code. They cannot catch
whether the generated TypeScript/TSX actually *compiles*. The duplicate
`TerminalsItem` bug (an item template referenced at two depths produced a
duplicate type definition, export, and import) shipped precisely because no test
type-checked the output. We want a regression guard: representative generated
output must compile cleanly.

## Constraint

This is a codegen repo, not a Sitecore app. It does **not** depend on
`@sitecore-content-sdk/nextjs`, and `lib/component-props` is a project-specific
module that does not exist here. Generated files import both. So the compile
check must supply its own type stubs for those modules; it cannot resolve the
real ones.

## Decision

Approach **A — in-memory TypeScript compiler API.** A test-only helper compiles
the generated files together with a hand-written shim `.d.ts` using the
`typescript` package (already a devDependency), entirely in memory under vitest.
No temp files, no spawning `tsc`, no new runtime dependencies.

Rejected:
- **B (shell out to `tsc`):** slower (spawns a compiler), needs disk I/O, clumsy
  failure messages.
- **C (install the real SDK):** couples tests to an SDK version, heavy dep, and
  `lib/component-props` still has to be stubbed.

## Scope

In scope: the compile-check test helper, the shim, and one test file exercising a
representative set of generated outputs. Out of scope: any change to inference,
codegen, or the CLI. (Empty-valued fields and `Field<boolean>` intentionally stay
`raw`/TODO — confirmed during brainstorming.)

## Architecture

Two new test-only units plus one test file:

1. **`packages/core/test/helpers/sitecore-shim.d.ts`** — ambient declarations the
   generated code depends on. Permissive about component props (to avoid false
   failures from not matching the real SDK), real-ish about field/item types (so
   member-access and duplicate-identifier errors are still caught):

   ```ts
   declare module '@sitecore-content-sdk/nextjs' {
     export type Field<T = string> = { value?: T; editable?: string };
     export type ImageField = { value?: { src?: string; alt?: string; width?: number; height?: number } };
     export type LinkField = { value?: { href?: string; text?: string; target?: string } };
     export const Text: (props: { field?: { value?: string | number }; tag?: string; className?: string }) => any;
     export const RichText: (props: { field?: Field<string>; className?: string }) => any;
     export const Image: (props: { field?: ImageField; className?: string }) => any;
     export const Link: (props: { field?: LinkField; className?: string }) => any;
     export const Placeholder: (props: { name: string; rendering: unknown }) => any;
     export function withDatasourceCheck(): <P>(Component: (props: P) => any) => (props: P) => any;
   }
   declare module 'lib/component-props' {
     export type ComponentProps = { rendering?: unknown; params?: { [k: string]: string | undefined } };
   }
   declare namespace JSX {
     interface Element {}
     interface IntrinsicElements { [elem: string]: any }
   }
   ```

   Component return types and the `IntrinsicElements` index are `any` on purpose:
   under `jsx: "preserve"` + `strict`, an `unknown` return would be rejected as
   "not a valid JSX element" and `unknown`-typed intrinsic props would reject
   element attributes — both false positives. Field/item *types* stay real, so
   member-access typos and duplicate identifiers are still caught. `Text.field` is
   `{ value?: string | number }` so the number-as-Text feature (`Field<number>`)
   type-checks.

2. **`packages/core/test/helpers/typecheck.ts`** — exports
   `typecheckComponents(components: { dir: string; files: GeneratedFile[] }[]): string[]`
   returning a list of formatted diagnostics (empty = clean). It:
   - Builds an in-memory map of virtual files: each component's `files` under its
     `dir` (e.g. `/virtual/Hero/Hero.tsx`, `/virtual/Hero/Hero.types.ts`), plus
     the shim at `/virtual/sitecore-shim.d.ts`. Only `.tsx`/`.types.ts` files are
     fed in (mock JSON and CSS are skipped).
   - Creates a `ts.CompilerHost` that serves virtual files from the map and
     delegates everything else (lib files, etc.) to `ts.createCompilerHost`, so
     the real `lib.d.ts` resolves for `string`, `Record`, `Set`, etc.
   - Compiles all components in **one** `ts.Program` (lib loaded once → fast),
     with options: `jsx: Preserve`, `strict: true`, `noEmit: true`,
     `target: ES2020`, `module: ESNext`, `moduleResolution: Bundler`,
     `skipLibCheck: true`.
   - Returns `ts.getPreEmitDiagnostics(program)` formatted as
     `"<fileName>(line,col): <message>"` strings.

3. **`packages/core/test/codegen-compile.test.ts`** — assembles representative
   `ComponentContract`s, runs each through `renderTypesFile` + `renderComponentFile`
   (and, for the variant case, with `variants`), packages them as
   `{ dir, files }`, calls `typecheckComponents`, and asserts the returned array
   is empty. One assertion over all scenarios; the failure message includes the
   offending diagnostics.

## Data flow

```
ComponentContract
  -> renderTypesFile / renderComponentFile  (existing codegen)
  -> { dir, files: GeneratedFile[] }
  -> typecheckComponents([...])
       -> virtual file map (+ shim)
       -> ts.Program (custom host, real lib via default host)
       -> getPreEmitDiagnostics
  -> string[]  (assert .toEqual([]))
```

## Representative scenarios (must all compile)

- **Kitchen sink:** Text + RichText + Image + Link fields, a param, a placeholder.
- **Nested cards:** a Cards field whose item has a nested Cards field.
- **Duplicate item type:** the `Terminals` top-level + nested-in-`Offers` case (the
  exact bug). Guards the `collectCardTypes` dedup.
- **Spaced names:** field/param names with spaces (bracket access + quoted keys).
- **Number as Text:** a `Field<number>` rendered via `<Text>`.
- **Variant module:** a contract rendered with `variants: ['Default', 'ThreeCard']`.

## Error handling

- If a generated file fails to compile, the diagnostic strings are returned and
  the test fails with them in the message — the developer sees the exact TS error
  and file. No swallowing.
- The helper throws (fails loudly) if asked to compile a component whose `files`
  contain no `.tsx`/`.types.ts` entry, to avoid a vacuously-passing test.

## Testing

The test file *is* the test. It is self-verifying: on the current (fixed) codebase
it passes; reverting the `collectCardTypes` dedup makes the duplicate-item-type
scenario fail with a "Duplicate identifier 'TerminalsItem'" diagnostic, which
demonstrates the guard works.

## Why this stays well-bounded

- `typecheck.ts` has one responsibility: given generated files, return compile
  diagnostics. It knows nothing about contracts or inference.
- The shim is data, not logic — a single declarations file.
- The test file owns the scenarios. Adding a future scenario is one contract + one
  entry, no helper changes.

## Out of scope (YAGNI)

- A `sitecore-scaffold doctor`/`--check` CLI command (this is a dev-time
  regression guard, not a user feature).
- Validating against the real SDK's exact prop types.
- Compiling the mock JSON or CSS outputs.
