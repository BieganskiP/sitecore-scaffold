import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  loadConfig as defaultLoadConfig,
  EdgeClient,
  filterRoutes,
  sortRoutes,
  renderRoutesTable,
  renderRoutesJson,
  renderRoutesTree,
  type RouteInfo,
  type RouteSort,
} from 'headcore-core';
import { resolveCliConfigPath } from '../config-path.js';

export interface RoutesDeps {
  loadConfig: typeof defaultLoadConfig;
  getRoutes: (lang: string, components: boolean) => Promise<RouteInfo[]>;
}

export interface RoutesInput {
  lang: string | undefined;
  filter: string | undefined;
  sort: RouteSort;
  json: boolean;
  out: string | undefined;
  components: boolean;
  tree: boolean;
  treeAll: boolean;
}

export interface RoutesResult {
  output: string;
  count: number;
}

export async function runRoutes(input: RoutesInput, deps?: Partial<RoutesDeps>): Promise<RoutesResult> {
  if (input.tree && (input.json || input.out !== undefined || input.components)) {
    throw new Error('--tree cannot be combined with --json, --out, or --components');
  }

  const loadConfig = deps?.loadConfig ?? defaultLoadConfig;
  const config = await loadConfig(resolveCliConfigPath());
  const lang = input.lang ?? config.edge.defaultLanguage;

  const getRoutes = deps?.getRoutes ?? ((l: string, c: boolean) => new EdgeClient(config.edge).getRoutes(l, { components: c }));
  const routes = sortRoutes(filterRoutes(await getRoutes(lang, input.components), input.filter), input.sort);

  if (input.out !== undefined) {
    const target = resolve(input.out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderRoutesJson(routes) + '\n', 'utf8');
    return { output: `Wrote ${routes.length} route(s) to ${input.out}`, count: routes.length };
  }

  const output = input.tree
    ? renderRoutesTree(routes, lang, { expandAll: input.treeAll })
    : input.json
      ? renderRoutesJson(routes)
      : renderRoutesTable(routes, lang);
  return { output, count: routes.length };
}
