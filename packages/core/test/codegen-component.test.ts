import { describe, it, expect } from 'vitest';
import { renderComponentFile } from '../src/codegen/component-file.js';
import type { ComponentContract } from '../src/types.js';

const contract: ComponentContract = {
  name: 'Hero',
  fields: [
    { name: 'heading', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
    { name: 'description', tsType: 'Field<string>', optional: true, renderer: 'RichText', sitecoreImport: 'RichText' },
    { name: 'image', tsType: 'ImageField', optional: true, renderer: 'Image', sitecoreImport: 'Image' },
    { name: 'ctaLink', tsType: 'LinkField', optional: true, renderer: 'Link', sitecoreImport: 'Link' },
  ],
  params: ['variant'],
  placeholders: [],
};

describe('renderComponentFile', () => {
  it('imports only used renderers and wraps in withDatasourceCheck when enabled', () => {
    const out = renderComponentFile(contract, {
      propsImport: '@/lib/component-props',
      sitecorePackage: '@sitecore-content-sdk/nextjs',
      useDatasourceCheck: true,
    });
    expect(out).toContain('Text');
    expect(out).toContain('RichText');
    expect(out).toContain('Image as SitecoreImage');
    expect(out).toContain('Link as SitecoreLink');
    expect(out).toContain('withDatasourceCheck');
    expect(out).toContain('<Text tag="h1" field={fields.heading} />');
    expect(out).toContain('{fields.image && <SitecoreImage field={fields.image} />}');
    expect(out).toContain('export default withDatasourceCheck()<HeroProps>(Hero);');
  });

  it('exports plainly when datasource check disabled', () => {
    const out = renderComponentFile(contract, {
      propsImport: '@/lib/component-props',
      sitecorePackage: '@sitecore-content-sdk/nextjs',
      useDatasourceCheck: false,
    });
    expect(out).toContain('export default Hero;');
    expect(out).not.toContain('withDatasourceCheck');
  });
});
