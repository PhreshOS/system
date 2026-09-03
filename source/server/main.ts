import { displayName, name, version } from "@/package.json"
import view from "./view/view"
import { defaultHome, environmentHome, environmentPorts, portRange, requestedHome, requestedPorts } from "./view/configuration"
import { fileURLToPath } from "node:url"

const requested = await requestedHome(process.argv)
const requestedPortSelection = await requestedPorts(process.argv)
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

    ports: environmentPorts(name, process.env) ?? requestedPortSelection ?? portRange(4300, 4399),

    assets: fileURLToPath(new URL("../client", import.meta.url))
})
