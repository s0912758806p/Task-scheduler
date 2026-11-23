import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Default environment is node. Component tests opt in per file with a
// `// @vitest-environment jsdom` docblock. Timeouts are raised because PGlite setup hooks can take
// well over the 10 s default on a loaded machine.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
