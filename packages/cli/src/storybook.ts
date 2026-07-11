import { existsSync } from 'node:fs';
import {
  renderStorybookDecorator,
  resolveStorybook,
  type GeneratedFile,
  type HeadcoreConfig,
} from 'headcore-core';

/**
 * The shared decorator as an output file — only when storybook is enabled and
 * the file doesn't exist yet. Never overwritten (not even with --force): once
 * written, the file belongs to the user.
 */
export function decoratorOutput(config: HeadcoreConfig): GeneratedFile | null {
  const storybook = resolveStorybook(config);
  if (!storybook.enabled || existsSync(storybook.decoratorPath)) return null;
  return { path: storybook.decoratorPath, contents: renderStorybookDecorator(config.sitecorePackage) };
}
