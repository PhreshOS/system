import { externalDependencies } from "@/vite.config"
import { rm, writeFile } from "node:fs/promises"
import packageConfig from "@/package.json"

process.env.NODE_ENV = "production"

const { build } = await import("vite")

const dependencies: Partial<typeof packageConfig.dependencies> = {}

await rm("dist", { recursive: true, force: true })

for (const externalDependency of externalDependencies) {

    dependencies[externalDependency] = packageConfig.dependencies[externalDependency]
}

await build({ configFile: "vite.config.ts", ssr: { noExternal: true } })

await build({ configFile: "vite.client.ts" })

await writeFile("dist/package.json", JSON.stringify({
    type: "module",
    engines: packageConfig.engines,
    scripts: {
        start: "node server/main.js"
    },
    dependencies
}))
