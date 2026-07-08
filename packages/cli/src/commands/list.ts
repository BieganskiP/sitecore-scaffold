import { listComponents } from '../registry.js';

/** Render the list of available registry components. */
export function runList(): string {
  const comps = listComponents();
  if (comps.length === 0) return 'No components available.';
  const lines = comps
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `  ${c.name} — ${c.description}`);
  return `Available components:\n${lines.join('\n')}`;
}
