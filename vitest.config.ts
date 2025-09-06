import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  css: {
    // Provide empty PostCSS config to stop Vite from searching root config
    postcss: {} as any,
  },
});
