import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLayout } from '../src/inspect/parse.js';

const raw = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/about-us-layout.json', import.meta.url)), 'utf8'),
);

describe('parseLayout', () => {
  it('builds a tree with route name and placeholders', () => {
    const tree = parseLayout(raw, '/about-us');
    expect(tree.route).toBe('/about-us');
    expect(Object.keys(tree.placeholders)).toEqual(['headless-main']);
  });

  it('captures rendering name, datasource, fields, params', () => {
    const hero = parseLayout(raw, '/about-us').placeholders['headless-main'][0];
    expect(hero.componentName).toBe('Hero');
    expect(hero.dataSource).toContain('About Hero');
    expect(Object.keys(hero.fields)).toContain('heading');
    expect(hero.params.variant).toBe('dark');
  });

  it('captures nested placeholders', () => {
    const promo = parseLayout(raw, '/about-us').placeholders['headless-main'][1];
    expect(promo.placeholders.cards[0].componentName).toBe('Card');
  });

  it('throws on missing route', () => {
    expect(() => parseLayout({ sitecore: { route: null } }, '/x')).toThrow(/no route/i);
  });
});
