import { defineConfig } from "vitest/config"
import decoratorPlugin from "./source/libs/decorator-plugin.js"

export default defineConfig({
  plugins: [decoratorPlugin()],
  resolve: { tsconfigPaths: true },
  test: {
    pool: "forks",
    maxWorkers: 2,
    projects: [
      {
        extends: true,
        test: {
          name: "default",
          include: [
            "tests/**/*.test.{ts,tsx,mjs}"
          ],
          exclude: [
            "tests/**/*.platform.test.*",
            "tests/**/*.live.test.*"
          ],
          environment: "node",
          testTimeout: 30000
        }
      }
    ]
  }
})
