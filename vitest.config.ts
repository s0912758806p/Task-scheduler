import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Default environment is node. Component tests opt in per file with a
// `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
