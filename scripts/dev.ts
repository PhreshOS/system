import { displayName, name, version } from "@/package.json"
import doors from "@server/view/doors"
import view, { environmentHome, environmentPort } from "@server/view/view"
import { createServer } from "vite"
import { fileURLToPath } from "node:url"

const home = environmentHome(name, process.env) ?? fileURLToPath(new URL("../storage", import.meta.url))

const host = await view({ name, displayName, version, mode: "development", hostname: "localhost", home })

const port = environmentPort(name, process.env)

const client = await createServer({

    configFile: "vite.client.ts",

    server: {

        allowedHosts: true,

        port,

        strictPort: port !== undefined,

        proxy: Object.fromEntries(Object.values(doors).map(door => [door, {

            changeOrigin: true,

            target: host.origin,

            ws: door === doors.link
        }]))
    }
})

await client.listen()

client.printUrls()
