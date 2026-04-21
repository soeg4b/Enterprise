import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

// Custom resolver: rewrite NodeNext-style `.js` import specifiers to their `.ts`
// counterpart on disk. The DeliverIQ backend uses `from '../foo.js'` style imports
// per ESM/NodeNext conventions; vitest/vite needs help to resolve them to TS sources.
const jsToTs = {
  name: 'deliveriq-js-to-ts',
  enforce: 'pre' as const,
  async resolveId(this: unknown, source: string, importer: string | undefined) {
    if (!importer) return null;
    if (!source.endsWith('.js')) return null;
    if (source.startsWith('node:')) return null;
    if (!source.startsWith('.') && !source.startsWith('/')) return null;
    const tsPath = resolve(dirname(importer), source.slice(0, -3) + '.ts');
    if (existsSync(tsPath)) return tsPath;
    return null;
  },
};

export default defineConfig({
  plugins: [jsToTs],
  test: {
    globals: true,
    environment: 'node',
    include: ['unit/**/*.test.ts', 'integration/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 15000,
    hookTimeout: 15000,
    reporters: ['default'],
    setupFiles: ['./integration/_setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        '../src/backend/src/engine/**/*.ts',
        '../src/backend/src/auth/**/*.ts',
        '../src/database/import/**/*.ts',
      ],
      exclude: ['**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      'deliveriq-shared': resolve(__dirname, '../src/shared/src/index.ts'),
    },
  },
});
