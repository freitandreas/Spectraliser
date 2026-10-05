import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// GitHub project pages serve from /<repo>/, so built asset URLs need that prefix.
const repositoryBase = '/Spectraliser/'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? repositoryBase) : '/',
  plugins: [svelte()],
  optimizeDeps: {
    exclude: ['pyodide'],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
}))
