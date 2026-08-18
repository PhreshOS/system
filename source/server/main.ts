import { displayName, name, version } from "@/package.json"
import view, { environmentPort } from "./view/view"
import { fileURLToPath } from "node:url"

await view({

    name,

    displayName,

    version,

    mode: "production",

    port: environmentPort(name, process.env) ?? 4300,

    assets: fileURLToPath(new URL("../client", import.meta.url))
})
