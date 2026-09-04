import { displayName, name, version } from "@/package.json"
import view from "./view/view"
import { defaultHome, defaultPorts, environmentHome, environmentPorts, requestedHome, requestedPorts } from "./view/configuration"
import { fileURLToPath } from "node:url"

const development = process.env.NODE_ENV === "development"
const requested = await requestedHome(process.argv)
const requestedPortSelection = await requestedPorts(process.argv)
const home = environmentHome(name, process.env)
    ?? requested
    ?? defaultHome(development)

await view({

    name,

    displayName,

    version,

    mode: "production",

    home,

    ports: environmentPorts(name, process.env) ?? requestedPortSelection ?? defaultPorts(development),

    assets: fileURLToPath(new URL("../client", import.meta.url))
})
