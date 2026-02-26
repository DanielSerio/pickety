import { defineConfig } from '@vscode/test-cli';
import { resolve } from 'path';

export default defineConfig([
  {
    label: 'all-tests',
    files: 'out/test/**/*.test.js',
    version: 'stable',
    workspaceFolder: resolve('./fixtures/next-ddd'),
  },
]);
