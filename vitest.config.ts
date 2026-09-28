/* Unit tests (npm test). Kept apart from vite.config.ts so the
   React Router plugin does not load while tests run. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
