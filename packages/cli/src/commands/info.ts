import { renderSitecoreInstructions } from 'headcore-core';
import { readComponentManifest } from '../registry.js';

export interface InfoInput {
  name: string | undefined;
}

/** Render component details plus its Sitecore modeling instructions. */
export function runInfo(input: InfoInput): string {
  if (!input.name) throw new Error('info requires a <Name> argument');
  const m = readComponentManifest(input.name);

  const deps = m.dependencies.length > 0 ? m.dependencies.join(', ') : 'none';
  const header = `${m.name}\n${m.description}\n\nFiles: ${m.files.join(', ')}\nnpm dependencies: ${deps}\n`;
  return `${header}\n${renderSitecoreInstructions(m)}`;
}
