import { describe, it, expect } from 'vitest';
import { renderRoutesTree } from '../src/routes/tree.js';
import type { RouteInfo } from '../src/edge/client.js';

function r(routePath: string, name: string): RouteInfo {
  return { routePath, name, updatedAt: null };
}

describe('renderRoutesTree', () => {
  it('renders nested segments with box-drawing branches and per-branch page counts', () => {
    const routes = [
      r('/', 'Home'),
      r('/about', 'About Us'),
      r('/flights', 'Flights'),
      r('/flights/arrivals', 'Arrivals'),
      r('/flights/departures', 'Departures'),
    ];
    expect(renderRoutesTree(routes, 'en')).toBe([
      '/  Home',
      '├── about  About Us',
      '└── flights  Flights  (2)',
      '    ├── arrivals  Arrivals',
      '    └── departures  Departures',
      '',
      '5 routes (lang: en)',
    ].join('\n'));
  });

  it('creates intermediate nodes for path segments that are not routes themselves', () => {
    const routes = [r('/blog/2026/hello-world', 'Hello World')];
    expect(renderRoutesTree(routes, 'en')).toBe([
      '/',
      '└── blog  (1)',
      '    └── 2026  (1)',
      '        └── hello-world  Hello World',
      '',
      '1 route (lang: en)',
    ].join('\n'));
  });

  it('collapses groups of more than 10 sibling leaves to the first 5 plus a +N more line', () => {
    const routes = [
      r('/news', 'News'),
      ...Array.from({ length: 12 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return r(`/news/a${n}`, `A${n}`);
      }),
    ];
    expect(renderRoutesTree(routes, 'en')).toBe([
      '/',
      '└── news  News  (12)',
      '    ├── a01  A01',
      '    ├── a02  A02',
      '    ├── a03  A03',
      '    ├── a04  A04',
      '    ├── a05  A05',
      '    └── … +7 more (use --tree-all)',
      '',
      '13 routes (lang: en)',
    ].join('\n'));
  });

  it('does not collapse groups of 10 or fewer sibling leaves', () => {
    const routes = Array.from({ length: 10 }, (_, i) => r(`/p${i}`, `P${i}`));
    const out = renderRoutesTree(routes, 'en');
    expect(out).not.toContain('more');
    expect(out.split('\n').filter((l) => l.includes('──'))).toHaveLength(10);
  });

  it('always shows branch children even when sibling leaves collapse', () => {
    const routes = [
      ...Array.from({ length: 12 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return r(`/a${n}`, `A${n}`);
      }),
      r('/zone/child', 'Child'),
    ];
    const out = renderRoutesTree(routes, 'en');
    expect(out).toContain('zone');
    expect(out).toContain('child');
    expect(out).toContain('… +7 more');
  });

  it('expands everything with expandAll', () => {
    const routes = Array.from({ length: 12 }, (_, i) => r(`/p${String(i).padStart(2, '0')}`, `P${i}`));
    const out = renderRoutesTree(routes, 'en', { expandAll: true });
    expect(out).not.toContain('more');
    expect(out).toContain('p11');
  });

  it('renders only the zero-count footer when there are no routes', () => {
    expect(renderRoutesTree([], 'da')).toBe('0 routes (lang: da)');
  });

  it('uses singular "route" for one result', () => {
    expect(renderRoutesTree([r('/', 'Home')], 'en')).toBe('/  Home\n\n1 route (lang: en)');
  });
});
