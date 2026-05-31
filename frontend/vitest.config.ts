import path from "path";
import { defineConfig } from "vitest/config";

// Lightweight config for pure-logic unit tests — no PWA/react plugins needed.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
