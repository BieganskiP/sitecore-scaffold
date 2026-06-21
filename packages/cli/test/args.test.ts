import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('parses inspect command with route', () => {
    expect(parseArgs(['inspect', '/about-us'])).toEqual({
      command: 'inspect', name: undefined, route: '/about-us',
      lang: undefined, dryRun: false, force: false,
    });
  });

  it('parses component command with name and flags', () => {
    expect(parseArgs(['component', 'Hero', '--route', '/about-us', '--lang', 'da', '--dry-run', '--force'])).toEqual({
      command: 'component', name: 'Hero', route: '/about-us', lang: 'da', dryRun: true, force: true,
    });
  });

  it('throws on unknown command', () => {
    expect(() => parseArgs(['frobnicate'])).toThrow(/unknown command/i);
  });

  it('throws when no command given', () => {
    expect(() => parseArgs([])).toThrow(/usage/i);
  });
});
