import packageConfig from "./package.json" with { type: "json" }
import decoratorPlugin from "./source/libs/decorator-plugin.js"
import { defineConfig } from "vite"
import { resolve } from "node:path"

export const externalDependencies: (keyof typeof packageConfig.dependencies)[] = [
    "cfonts",
    "sharp"
]

export default defineConfig({
    root: "source/server",
    plugins: [decoratorPlugin()],
    resolve: {
        tsconfigPaths: true
    },
    ssr: {
        noExternal: true,
        external: externalDependencies
    },
    build: {
        ssr: true,
        emptyOutDir: true,
        outDir: resolve(import.meta.dirname, "dist/server"),
        rolldownOptions: {
            input: "main.ts"
        }
    }
})
