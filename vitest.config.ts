import { defineConfig } from "vitest/config"
import decoratorPlugin from "./source/libs/decorator-plugin.js"
import workerThreadPlugin from "./source/libs/worker-thread-plugin.js"

export default defineConfig({
  plugins: [decoratorPlugin(), workerThreadPlugin()],
  resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom"] },
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
