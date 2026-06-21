import { describe, it, expect } from 'vitest';
import { renderTypesFile } from '../src/codegen/types-file.js';
import type { ComponentContract } from '../src/types.js';

const contract: ComponentContract = {
  name: 'Hero',
  fields: [
    { name: 'heading', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
    { name: 'image', tsType: 'ImageField', optional: true, renderer: 'Image', sitecoreImport: 'Image' },
  ],
  params: ['variant'],
  placeholders: [],
};

describe('renderTypesFile', () => {
  it('emits Fields, Params and Props types', () => {
    const out = renderTypesFile(contract, '@/lib/component-props');
    expect(out).toContain('type HeroFields = {');
    expect(out).toContain('heading: Field<string>;');
    expect(out).toContain('image?: ImageField;');
    expect(out).toContain('type HeroParams = {');
    expect(out).toContain('variant?: string;');
    expect(out).toContain('type HeroProps = ComponentProps & {');
    expect(out).toContain("import { ComponentProps } from '@/lib/component-props';");
  });
});
