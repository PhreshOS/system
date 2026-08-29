import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import decoratorPlugin from "./source/libs/decorator-plugin.js"
import tailwindcss from "@tailwindcss/vite"
import babel from "@rolldown/plugin-babel"
import { defineConfig } from "vite"
import { resolve } from "node:path"

export default defineConfig({
    root: "source/client",
    plugins: [
        react(),
        tailwindcss(),
        decoratorPlugin(),
        babel({ presets: [reactCompilerPreset()] })
    ],
    resolve: {
        tsconfigPaths: true,
        dedupe: ["react", "react-dom"]
    },
    build: {
        emptyOutDir: true,
        outDir: resolve(import.meta.dirname, "dist/client")
    }
})
