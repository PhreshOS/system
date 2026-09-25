import { displayName, name, version } from "@/package.json"
import view from "./view/view"
import { defaultHome, defaultHostname, defaultPorts, environmentHome, environmentHostname, environmentPorts, requestedHome, requestedPorts } from "./view/configuration"
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

    // A published container port cannot reach a listener confined to the
    // container's loopback interface, so the deployment owns this selection.
    hostname: environmentHostname(name, process.env) ?? defaultHostname(),

    home,

    ports: environmentPorts(name, process.env) ?? requestedPortSelection ?? defaultPorts(development),

    assets: fileURLToPath(new URL("../client", import.meta.url))
})
