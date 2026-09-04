import { displayName, name, version } from "@/package.json"
import doors from "@server/view/http/doors"
import view from "@server/view/view"
import { defaultHome, defaultPorts, environmentHome, environmentPorts } from "@server/view/configuration"
import { createServer } from "vite"

const home = environmentHome(name, process.env) ?? defaultHome(true)

const host = await view({

    name,

    displayName,

    version,

    mode: "development",

    hostname: "localhost",

    home,

    ports: environmentPorts(name, process.env) ?? defaultPorts(true)
})

const client = await createServer({

    configFile: "vite.client.ts",

    server: {

        allowedHosts: true,

        proxy: Object.fromEntries(Object.values(doors).map(door => [door, {

            changeOrigin: true,

            target: host.origin,

            ws: door === doors.link
        }]))
    }
})

await client.listen()

client.printUrls()
