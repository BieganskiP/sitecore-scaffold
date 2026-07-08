import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAdd } from '../src/commands/add.js';
import type { HeadcoreConfig } from 'headcore-core';

function makeConfig(dir: string, componentFolder = true): HeadcoreConfig {
  return {
    edge: { contextId: 'x', site: 's', defaultLanguage: 'en' },
    componentPath: join(dir, 'src/components/sitecore'),
    componentFolder,
    componentPropsImport: 'src/lib/component-props',
    sitecorePackage: '@sitecore-content-sdk/nextjs',
    useDatasourceCheck: true,
    generateMocks: true,
    styling: 'css',
    fieldTypeOverrides: {},
    i18nPath: 'src/lib/i18n',
    i18nPackage: 'next-localization',
  };
}

describe('runAdd', () => {
  it('copies Tabs files into a per-component folder and writes SITECORE.md', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'headcore-add-'));
    const config = makeConfig(dir);
    const result = await runAdd({ name: 'Tabs', dryRun: false, force: false }, { loadConfig: vi.fn().mockResolvedValue(config) });

    const base = join(config.componentPath, 'Tabs');
    expect(existsSync(join(base, 'Tabs.tsx'))).toBe(true);
    expect(existsSync(join(base, 'SITECORE.md'))).toBe(true);
    expect(result.written.some((p) => p.endsWith('Tabs.tsx'))).toBe(true);

    // import rewrite applied to the props-import specifier
    const tsx = readFileSync(join(base, 'Tabs.tsx'), 'utf8');
    expect(tsx).toContain("from '@sitecore-content-sdk/nextjs'");
    const types = readFileSync(join(base, 'Tabs.types.ts'), 'utf8');
    expect(types).toContain("from 'src/lib/component-props'");
    expect(types).not.toContain("from 'lib/component-props'");
  });

  it('dry-run writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'headcore-add-'));
    const config = makeConfig(dir);
    const result = await runAdd({ name: 'Tabs', dryRun: true, force: false }, { loadConfig: vi.fn().mockResolvedValue(config) });
    expect(existsSync(join(config.componentPath, 'Tabs', 'Tabs.tsx'))).toBe(false);
    expect(result.written).toEqual([]);
    expect(result.preview.length).toBeGreaterThan(0);
  });

  it('refuses to overwrite existing files without --force', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'headcore-add-'));
    const config = makeConfig(dir);
    const deps = { loadConfig: vi.fn().mockResolvedValue(config) };
    await runAdd({ name: 'Tabs', dryRun: false, force: false }, deps);
    await expect(runAdd({ name: 'Tabs', dryRun: false, force: false }, deps)).rejects.toThrow(/already exists/);
  });

  it('throws for an unknown component', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'headcore-add-'));
    const config = makeConfig(dir);
    await expect(runAdd({ name: 'nope', dryRun: false, force: false }, { loadConfig: vi.fn().mockResolvedValue(config) })).rejects.toThrow(/nope/);
  });
});
