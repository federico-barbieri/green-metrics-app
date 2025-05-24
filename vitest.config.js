import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from '@vitejs/plugin-react'


export default defineConfig({
    plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["**/*.{test,spec}.{js,jsx}"],
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "./app"),
    },
  },
});
