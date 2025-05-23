import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['**/*.{test,spec}.{js,jsx}'],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app')
    }
  }
})