import { rm, writeFile } from "node:fs/promises"
import packageConfig from "../package.json" with { type: "json" }
import { build, loadConfigFromFile } from "vite"

const serverConfigFile = "vite.server.ts"
const loadedServerConfig = await loadConfigFromFile({
    command: "build",
    mode: "production",
    isSsrBuild: true,
    isPreview: false
}, serverConfigFile)

if (!loadedServerConfig) throw new Error(`${serverConfigFile} could not be loaded`)

const externalDependencies = loadedServerConfig.config.ssr?.external

if (!Array.isArray(externalDependencies) || !externalDependencies.every(name => typeof name === "string")) {

    throw new Error(`${serverConfigFile} must declare string-only ssr.external dependencies`)
}

const dependencies = Object.fromEntries(externalDependencies.map(name => {

    const version = packageConfig.dependencies[name]

    if (!version) throw new Error(`${name} is external but absent from dependencies`)

    return [name, version]
}))

await rm("dist", { recursive: true, force: true })

await build({ configFile: serverConfigFile })

await build({ configFile: "vite.client.ts" })

await writeFile("dist/package.json", JSON.stringify({
    type: "module",
    engines: packageConfig.engines,
    scripts: {
        start: "node server/main.js"
    },
    dependencies
}))
