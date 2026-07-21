export interface ParsedArgs {
  command: 'inspect' | 'component' | 'page' | 'dictionary' | 'routes' | 'list' | 'info' | 'add' | 'init' | 'gui';
  name: string | undefined;
  route: string | undefined;
  lang: string | undefined;
  dryRun: boolean;
  force: boolean;
  variants: string[];
  filter: string | undefined;
  sort: 'path' | 'updated';
  json: boolean;
  out: string | undefined;
  components: boolean;
  tree: boolean;
  treeAll: boolean;
  port: number | undefined;
  noOpen: boolean;
}

const USAGE = `usage:

Setup:
  headcore init [--force] [--dry-run]

Library:
  headcore list
  headcore info <Name>
  headcore add <Name> [--dry-run] [--force]

Introspect:
  headcore inspect <route>
  headcore page <route> [--lang <lang>] [--dry-run] [--force]
  headcore dictionary [--lang <lang>] [--dry-run] [--force]
  headcore routes [--lang <lang>] [--filter <substring>] [--sort path|updated] [--components] [--tree [--tree-all]] [--json] [--out <file>]
  headcore gui [--lang <lang>] [--port <n>] [--no-open]
  headcore component <Name> --route <route> [--lang <lang>] [--variants <A,B,C>] [--dry-run] [--force]`;

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) throw new Error(USAGE);
  const [command, ...rest] = argv;
  if (
    command !== 'inspect' && command !== 'component' && command !== 'page' &&
    command !== 'dictionary' && command !== 'routes' &&
    command !== 'list' && command !== 'info' && command !== 'add' && command !== 'init' &&
    command !== 'gui'
  ) {
    throw new Error(`unknown command "${command}"\n${USAGE}`);
  }

  const positionals: string[] = [];
  let route: string | undefined;
  let lang: string | undefined;
  let dryRun = false;
  let force = false;
  let variants: string[] = [];
  let filter: string | undefined;
  let sort: 'path' | 'updated' = 'path';
  let json = false;
  let out: string | undefined;
  let components = false;
  let tree = false;
  let treeAll = false;
  let port: number | undefined;
  let noOpen = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--route') route = rest[++i];
    else if (arg === '--lang') lang = rest[++i];
    else if (arg === '--variants') variants = (rest[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--force') force = true;
    else if (arg === '--filter') filter = rest[++i];
    else if (arg === '--json') json = true;
    else if (arg === '--components') components = true;
    else if (arg === '--tree') tree = true;
    else if (arg === '--tree-all') { tree = true; treeAll = true; }
    else if (arg === '--out') {
      out = rest[++i];
      if (out === undefined) throw new Error(`--out requires a file path\n${USAGE}`);
    }
    else if (arg === '--sort') {
      const value = rest[++i];
      if (value !== 'path' && value !== 'updated') {
        throw new Error(`--sort must be "path" or "updated", got "${value ?? ''}"\n${USAGE}`);
      }
      sort = value;
    }
    else if (arg === '--no-open') noOpen = true;
    else if (arg === '--port') {
      const value = rest[++i];
      const parsed = Number.parseInt(value ?? '', 10);
      if (value === undefined || String(parsed) !== value || parsed < 1 || parsed > 65535) {
        throw new Error(`--port must be an integer between 1 and 65535, got "${value ?? ''}"\n${USAGE}`);
      }
      port = parsed;
    } else positionals.push(arg);
  }

  if (
    command === 'inspect' || command === 'page' || command === 'dictionary' ||
    command === 'routes' || command === 'list' || command === 'init' || command === 'gui'
  ) {
    return { command, name: undefined, route: positionals[0], lang, dryRun, force, variants, filter, sort, json, out, components, tree, treeAll, port, noOpen };
  }
  // component | info | add — take a <Name> positional
  return { command, name: positionals[0], route, lang, dryRun, force, variants, filter, sort, json, out, components, tree, treeAll, port, noOpen };
}
