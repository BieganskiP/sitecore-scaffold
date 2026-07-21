import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Absolute path to the bundled dashboard assets. */
export function defaultGuiDistDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'gui-dist');
}
