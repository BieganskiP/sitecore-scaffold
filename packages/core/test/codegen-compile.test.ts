import { describe, it, expect } from 'vitest';
import { renderTypesFile } from '../src/codegen/types-file.js';
import { renderComponentFile } from '../src/codegen/component-file.js';
import type { ComponentContract, GeneratedFile } from '../src/types.js';
import { typecheckComponents } from './helpers/typecheck.js';

const PROPS_IMPORT = 'lib/component-props';
const SDK = '@sitecore-content-sdk/nextjs';

function filesFor(
  contract: ComponentContract,
  opts: { useDatasourceCheck?: boolean; variants?: string[] } = {},
): GeneratedFile[] {
  return [
    {
      path: `${contract.name}/${contract.name}.types.ts`,
      contents: renderTypesFile(contract, PROPS_IMPORT),
    },
    {
      path: `${contract.name}/${contract.name}.tsx`,
      contents: renderComponentFile(contract, {
        propsImport: PROPS_IMPORT,
        sitecorePackage: SDK,
        useDatasourceCheck: opts.useDatasourceCheck ?? true,
        styling: 'none',
        variants: opts.variants,
      }),
    },
  ];
}

const kitchenSink: ComponentContract = {
  name: 'Hero',
  fields: [
    { name: 'heading', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
    { name: 'description', tsType: 'Field<string>', optional: true, renderer: 'RichText', sitecoreImport: 'RichText' },
    { name: 'image', tsType: 'ImageField', optional: true, renderer: 'Image', sitecoreImport: 'Image' },
    { name: 'ctaLink', tsType: 'LinkField', optional: true, renderer: 'Link', sitecoreImport: 'Link' },
  ],
  params: ['variant'],
  placeholders: ['hero-body'],
};

const nestedCards: ComponentContract = {
  name: 'NestedCards',
  fields: [
    {
      name: 'Tabs', tsType: 'TabsItem[]', optional: false, renderer: 'Cards', sitecoreImport: null,
      itemTypeName: 'TabsItem',
      itemFields: [
        { name: 'Tab Title', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
        {
          name: 'Column Slider Items', tsType: 'ColumnSliderItemsItem[]', optional: false, renderer: 'Cards',
          sitecoreImport: null, itemTypeName: 'ColumnSliderItemsItem',
          itemFields: [
            { name: 'Slide Title', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
          ],
        },
      ],
    },
  ],
  params: [],
  placeholders: [],
};

// The exact shape of the duplicate-item-type bug: "Terminals" appears top-level
// and nested inside "Offers", so both yield itemTypeName "TerminalsItem".
const duplicateItemType: ComponentContract = {
  name: 'ParkingFeeCalculator',
  fields: [
    {
      name: 'Terminals', tsType: 'TerminalsItem[]', optional: false, renderer: 'Cards', sitecoreImport: null,
      itemTypeName: 'TerminalsItem',
      itemFields: [
        { name: 'Name', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
      ],
    },
    {
      name: 'Offers', tsType: 'OffersItem[]', optional: false, renderer: 'Cards', sitecoreImport: null,
      itemTypeName: 'OffersItem',
      itemFields: [
        {
          name: 'Terminals', tsType: 'TerminalsItem[]', optional: false, renderer: 'Cards', sitecoreImport: null,
          itemTypeName: 'TerminalsItem',
          itemFields: [
            { name: 'Name', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
          ],
        },
      ],
    },
  ],
  params: [],
  placeholders: [],
};

const spacedNames: ComponentContract = {
  name: 'Promo',
  fields: [
    { name: 'Button Link', tsType: 'LinkField', optional: false, renderer: 'Link', sitecoreImport: 'Link' },
    { name: 'Right Box Title', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
  ],
  params: ['Some Param'],
  placeholders: [],
};

const numberAsText: ComponentContract = {
  name: 'Stat',
  fields: [
    { name: 'count', tsType: 'Field<number>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
    { name: 'label', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
  ],
  params: [],
  placeholders: [],
};

const variantModule: ComponentContract = {
  name: 'GridModule',
  fields: [
    { name: 'Title', tsType: 'Field<string>', optional: false, renderer: 'Text', sitecoreImport: 'Text' },
  ],
  params: [],
  placeholders: [],
};

describe('generated output compiles', () => {
  it('compiles a kitchen-sink component (all renderers + params + placeholder)', () => {
    const diagnostics = typecheckComponents([{ dir: 'Hero', files: filesFor(kitchenSink) }]);
    expect(diagnostics).toEqual([]);
  });

  it('compiles nested card maps', () => {
    expect(typecheckComponents([{ dir: 'NestedCards', files: filesFor(nestedCards) }])).toEqual([]);
  });

  it('compiles a component whose item type recurs at multiple depths (no duplicate identifiers)', () => {
    expect(
      typecheckComponents([{ dir: 'ParkingFeeCalculator', files: filesFor(duplicateItemType) }]),
    ).toEqual([]);
  });

  it('compiles field and param names containing spaces', () => {
    expect(typecheckComponents([{ dir: 'Promo', files: filesFor(spacedNames) }])).toEqual([]);
  });

  it('compiles a numeric field rendered via <Text>', () => {
    expect(typecheckComponents([{ dir: 'Stat', files: filesFor(numberAsText) }])).toEqual([]);
  });

  it('compiles a variant module', () => {
    expect(
      typecheckComponents([{ dir: 'GridModule', files: filesFor(variantModule, { variants: ['Default', 'ThreeCard'] }) }]),
    ).toEqual([]);
  });
});
