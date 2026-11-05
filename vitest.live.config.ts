import { defineConfig } from "vitest/config";
import path from "node:path";
import { loadEnvFile } from "node:process";

loadEnvFile(".env.local");
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { include: ["tests-live/**/*.live.ts"], testTimeout: 90_000 },
});
