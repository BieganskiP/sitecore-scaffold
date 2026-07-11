import type { ComponentContract, GeneratedFile, RenderingNode, HeadcoreConfig } from '../types.js';
import { renderTypesFile } from './types-file.js';
import { renderComponentFile } from './component-file.js';
import { renderMockFile } from './mock-file.js';
import { renderStoryFile } from './story-file.js';
import { createStyleHelper } from './styling.js';
import { resolveStorybook } from '../config/storybook.js';

type CodegenConfig = Omit<HeadcoreConfig, 'edge'>;

export function generateFiles(
  contract: ComponentContract,
  node: RenderingNode,
  config: CodegenConfig,
  variants?: string[],
): GeneratedFile[] {
  const dir = config.componentFolder
    ? `${config.componentPath}/${contract.name}`
    : config.componentPath;
  const base = `${dir}/${contract.name}`;
  const files: GeneratedFile[] = [
    { path: `${base}.types.ts`, contents: renderTypesFile(contract, config.componentPropsImport) },
    {
      path: `${base}.tsx`,
      contents: renderComponentFile(contract, {
        propsImport: config.componentPropsImport,
        sitecorePackage: config.sitecorePackage,
        useDatasourceCheck: config.useDatasourceCheck,
        styling: config.styling,
        variants,
      }),
    },
  ];
  const storybook = resolveStorybook(config);
  if (config.generateMocks || storybook.enabled) {
    files.push({ path: `${base}.mock.json`, contents: renderMockFile(node) });
  }
  if (storybook.enabled) {
    files.push({
      path: `${base}.stories.tsx`,
      contents: renderStoryFile(contract.name, node.placeholders, {
        componentPath: config.componentPath,
        componentFolder: config.componentFolder,
        titlePrefix: storybook.titlePrefix,
        decoratorPath: storybook.decoratorPath,
      }),
    });
  }
  const style = createStyleHelper(contract.name, config.styling);
  if (style.cssFile) {
    files.push({ path: `${base}.module.css`, contents: style.cssFile });
  }
  return files;
}
