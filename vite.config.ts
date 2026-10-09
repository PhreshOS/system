import workerThreadPlugin from "./source/libs/worker-thread-plugin.js"
import packageConfig from "./package.json" with { type: "json" }
import decoratorPlugin from "./source/libs/decorator-plugin.js"
import { defineConfig } from "vite"
import { resolve } from "node:path"

export const externalDependencies: (keyof typeof packageConfig.dependencies)[] = [
    "cfonts",
    "sharp",
    "web-streams-polyfill"
]

export default defineConfig({
    root: "source/server",
    plugins: [decoratorPlugin(), workerThreadPlugin()],
    resolve: {
        tsconfigPaths: true
    },
    ssr: {
        external: externalDependencies
    },
    build: {
        ssr: true,
        // The files the server reads, imported with `?url`, are carried beside it, never inlined.
        ssrEmitAssets: true,
        assetsInlineLimit: 0,
        emptyOutDir: true,
        outDir: resolve(import.meta.dirname, "dist/server"),
        rolldownOptions: {
            input: "main.ts"
        }
    }
})
