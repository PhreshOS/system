import { externalDependencies } from "@/vite.config"
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import packageConfig from "@/package.json"

process.env.NODE_ENV = "production"

const { build } = await import("vite")

const dependencies: Partial<typeof packageConfig.dependencies> = {}

await rm("dist", { recursive: true, force: true })

for (const externalDependency of externalDependencies) {

    dependencies[externalDependency] = packageConfig.dependencies[externalDependency]
}

await build({ configFile: "vite.config.ts", ssr: { noExternal: true } })

const require = createRequire(import.meta.url)
const sandboxWasm = require.resolve("@jitl/quickjs-ng-wasmfile-release-sync/wasm")
const sandboxWasmDestination = resolve("dist/server/assets/emscripten-module.wasm")
await mkdir(dirname(sandboxWasmDestination), { recursive: true })
await copyFile(sandboxWasm, sandboxWasmDestination)

await build({ configFile: "vite.client.ts" })

await writeFile("dist/package.json", JSON.stringify({
    type: "module",
    engines: packageConfig.engines,
    scripts: {
        start: "node server/main.js"
    },
    dependencies
}))
