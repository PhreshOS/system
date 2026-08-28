import { displayName, name, version } from "@/package.json"
import view, { defaultHome, environmentHome, environmentPort, requestedHome } from "./view/view"
import { fileURLToPath } from "node:url"

const requested = await requestedHome(process.argv)
const home = environmentHome(name, process.env)
    ?? requested
    ?? defaultHome(process.argv)
    ?? fileURLToPath(new URL("../../storage", import.meta.url))

await view({

    name,

    displayName,

    version,

    mode: "production",

    home,

    port: environmentPort(name, process.env) ?? 4300,

    assets: fileURLToPath(new URL("../client", import.meta.url))
})
