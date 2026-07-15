import type { RouteInfo } from '../edge/client.js';

interface TreeNode {
  segment: string;
  route?: RouteInfo;
  children: Map<string, TreeNode>;
}

// Leaf siblings beyond this count collapse to the first COLLAPSED_SHOWN plus a "+N more" line.
const COLLAPSE_THRESHOLD = 10;
const COLLAPSED_SHOWN = 5;

function buildTree(routes: RouteInfo[]): TreeNode {
  const root: TreeNode = { segment: '/', children: new Map() };
  for (const route of routes) {
    let node = root;
    for (const segment of route.routePath.split('/').filter(Boolean)) {
      let child = node.children.get(segment);
      if (!child) {
        child = { segment, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.route = route;
  }
  return root;
}

function subtreeRouteCount(node: TreeNode): number {
  let count = 0;
  for (const child of node.children.values()) {
    count += (child.route ? 1 : 0) + subtreeRouteCount(child);
  }
  return count;
}

function label(node: TreeNode, withCount: boolean): string {
  let out = node.segment;
  if (node.route && node.route.name) out += `  ${node.route.name}`;
  if (withCount && node.children.size > 0) out += `  (${subtreeRouteCount(node)})`;
  return out;
}

function renderChildren(node: TreeNode, prefix: string, expandAll: boolean, lines: string[]): void {
  const kids = [...node.children.values()].sort((a, b) => a.segment.localeCompare(b.segment));
  const leaves = kids.filter((k) => k.children.size === 0);

  let shown = kids;
  let hidden = 0;
  if (!expandAll && leaves.length > COLLAPSE_THRESHOLD) {
    const keptLeaves = new Set(leaves.slice(0, COLLAPSED_SHOWN));
    shown = kids.filter((k) => k.children.size > 0 || keptLeaves.has(k));
    hidden = leaves.length - COLLAPSED_SHOWN;
  }

  for (const [i, child] of shown.entries()) {
    const isLast = hidden === 0 && i === shown.length - 1;
    lines.push(`${prefix}${isLast ? '└── ' : '├── '}${label(child, true)}`);
    renderChildren(child, `${prefix}${isLast ? '    ' : '│   '}`, expandAll, lines);
  }
  if (hidden > 0) {
    lines.push(`${prefix}└── … +${hidden} more (use --tree-all)`);
  }
}

export function renderRoutesTree(
  routes: RouteInfo[],
  lang: string,
  opts?: { expandAll?: boolean },
): string {
  const footer = `${routes.length} route${routes.length === 1 ? '' : 's'} (lang: ${lang})`;
  if (routes.length === 0) return footer;

  const root = buildTree(routes);
  const lines = [label(root, false)];
  renderChildren(root, '', opts?.expandAll === true, lines);
  return `${lines.join('\n')}\n\n${footer}`;
}
