import type { ComponentContract } from '../types.js';

export function renderTypesFile(c: ComponentContract, propsImport: string): string {
  const fieldLines = c.fields
    .map((f) => `  ${f.name}${f.optional ? '?' : ''}: ${f.tsType};`)
    .join('\n');
  const paramLines = c.params.map((p) => `  ${p}?: string;`).join('\n');

  return `import { Field, ImageField, LinkField } from '@sitecore-content-sdk/nextjs';
import { ComponentProps } from '${propsImport}';

type ${c.name}Fields = {
${fieldLines}
};

type ${c.name}Params = {
${paramLines}
};

type ${c.name}Props = ComponentProps & {
  fields: ${c.name}Fields;
  params?: ${c.name}Params;
};

export type { ${c.name}Fields, ${c.name}Params, ${c.name}Props };
`;
}
