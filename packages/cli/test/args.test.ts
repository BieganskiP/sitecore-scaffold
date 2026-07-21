import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('parses inspect command with route', () => {
    expect(parseArgs(['inspect', '/about-us'])).toEqual({
      command: 'inspect', name: undefined, route: '/about-us',
      lang: undefined, dryRun: false, force: false, variants: [],
      filter: undefined, sort: 'path', json: false, out: undefined, components: false, tree: false, treeAll: false,
      port: undefined, noOpen: false,
    });
  });

  it('parses component command with name and flags', () => {
    expect(parseArgs(['component', 'Hero', '--route', '/about-us', '--lang', 'da', '--dry-run', '--force'])).toEqual({
      command: 'component', name: 'Hero', route: '/about-us', lang: 'da', dryRun: true, force: true, variants: [],
      filter: undefined, sort: 'path', json: false, out: undefined, components: false, tree: false, treeAll: false,
      port: undefined, noOpen: false,
    });
  });

  it('parses a comma-separated --variants list, trimming whitespace', () => {
    const parsed = parseArgs(['component', 'GridModule', '--route', '/x', '--variants', 'ThreeCard, FourCard']);
    expect(parsed.variants).toEqual(['ThreeCard', 'FourCard']);
  });

  it('defaults variants to an empty array when the flag is absent', () => {
    expect(parseArgs(['component', 'GridModule', '--route', '/x']).variants).toEqual([]);
  });

  it('parses the init command with flags', () => {
    expect(parseArgs(['init', '--force', '--dry-run'])).toEqual({
      command: 'init', name: undefined, route: undefined,
      lang: undefined, dryRun: true, force: true, variants: [],
      filter: undefined, sort: 'path', json: false, out: undefined, components: false, tree: false, treeAll: false,
      port: undefined, noOpen: false,
    });
  });

  it('parses the init command with no flags', () => {
    const parsed = parseArgs(['init']);
    expect(parsed.command).toBe('init');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.force).toBe(false);
  });

  it('throws on unknown command', () => {
    expect(() => parseArgs(['frobnicate'])).toThrow(/unknown command/i);
  });

  it('throws when no command given', () => {
    expect(() => parseArgs([])).toThrow(/usage/i);
  });

  it('parses page command with route as a positional', () => {
    expect(parseArgs(['page', '/about-us', '--lang', 'da', '--dry-run'])).toEqual({
      command: 'page', name: undefined, route: '/about-us', lang: 'da', dryRun: true, force: false, variants: [],
      filter: undefined, sort: 'path', json: false, out: undefined, components: false, tree: false, treeAll: false,
      port: undefined, noOpen: false,
    });
  });

  it('parses the dictionary command with flags', () => {
    expect(parseArgs(['dictionary', '--lang', 'da', '--dry-run', '--force'])).toEqual({
      command: 'dictionary', name: undefined, route: undefined,
      lang: 'da', dryRun: true, force: true, variants: [],
      filter: undefined, sort: 'path', json: false, out: undefined, components: false, tree: false, treeAll: false,
      port: undefined, noOpen: false,
    });
  });

  it('parses the routes command with all flags', () => {
    expect(parseArgs(['routes', '--lang', 'da', '--filter', '/products', '--sort', 'updated', '--json'])).toEqual({
      command: 'routes', name: undefined, route: undefined,
      lang: 'da', dryRun: false, force: false, variants: [],
      filter: '/products', sort: 'updated', json: true, out: undefined, components: false, tree: false, treeAll: false,
      port: undefined, noOpen: false,
    });
  });

  it('defaults routes to sort by path with no filter and no json', () => {
    const parsed = parseArgs(['routes']);
    expect(parsed.command).toBe('routes');
    expect(parsed.filter).toBeUndefined();
    expect(parsed.sort).toBe('path');
    expect(parsed.json).toBe(false);
  });

  it('parses --components on the routes command', () => {
    expect(parseArgs(['routes', '--components']).components).toBe(true);
  });

  it('defaults components to false when the flag is absent', () => {
    expect(parseArgs(['routes']).components).toBe(false);
  });

  it('parses --tree on the routes command', () => {
    const parsed = parseArgs(['routes', '--tree']);
    expect(parsed.tree).toBe(true);
    expect(parsed.treeAll).toBe(false);
  });

  it('parses --tree-all and implies --tree', () => {
    const parsed = parseArgs(['routes', '--tree-all']);
    expect(parsed.tree).toBe(true);
    expect(parsed.treeAll).toBe(true);
  });

  it('defaults tree flags to false when absent', () => {
    const parsed = parseArgs(['routes']);
    expect(parsed.tree).toBe(false);
    expect(parsed.treeAll).toBe(false);
  });

  it('throws on an invalid --sort value', () => {
    expect(() => parseArgs(['routes', '--sort', 'name'])).toThrow(/--sort must be "path" or "updated"/i);
  });

  it('parses --out with a file path', () => {
    const parsed = parseArgs(['routes', '--json', '--out', 'routes.json']);
    expect(parsed.command).toBe('routes');
    expect(parsed.out).toBe('routes.json');
    expect(parsed.json).toBe(true);
  });

  it('throws when --out is missing its file path', () => {
    expect(() => parseArgs(['routes', '--out'])).toThrow(/--out requires a file path/i);
  });
});

describe('parseArgs gui', () => {
  it('parses gui with defaults', () => {
    const args = parseArgs(['gui']);
    expect(args.command).toBe('gui');
    expect(args.port).toBeUndefined();
    expect(args.noOpen).toBe(false);
    expect(args.lang).toBeUndefined();
  });

  it('parses --lang, --port and --no-open', () => {
    const args = parseArgs(['gui', '--lang', 'da', '--port', '5000', '--no-open']);
    expect(args.lang).toBe('da');
    expect(args.port).toBe(5000);
    expect(args.noOpen).toBe(true);
  });

  it('accepts the port range boundaries', () => {
    expect(parseArgs(['gui', '--port', '1']).port).toBe(1);
    expect(parseArgs(['gui', '--port', '65535']).port).toBe(65535);
  });

  it('rejects a non-numeric or out-of-range --port', () => {
    expect(() => parseArgs(['gui', '--port', 'abc'])).toThrow(/--port/);
    expect(() => parseArgs(['gui', '--port', '0'])).toThrow(/--port/);
    expect(() => parseArgs(['gui', '--port', '70000'])).toThrow(/--port/);
    expect(() => parseArgs(['gui', '--port'])).toThrow(/--port/);
    expect(() => parseArgs(['gui', '--port', '08'])).toThrow(/--port/);
  });

  it('mentions gui in usage for unknown commands', () => {
    expect(() => parseArgs(['nope'])).toThrow(/headcore gui/);
  });
});
