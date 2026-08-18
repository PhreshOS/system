import Application from "@server/core/application"
import { serveStatic } from "@hono/node-server/serve-static"
import { serve } from "@hono/node-server"
import { WebSocketServer } from "ws"
import doors from "./doors"
import intake from "./intake"
import program from "./program"
import proxy from "./proxy"
import storage from "./storage"
import uploads from "./uploads"
import link from "./link"
import getPort from "get-port"
import cfonts from "cfonts"
import { Hono } from "hono"
import { isAbsolute, resolve } from "node:path"
import { styleText } from "node:util"
import environment from "@libs/environment"

export default async function (config: Config) {

    const debugging = config.mode === "development"

    cfonts.say(`${config.displayName} v${config.version}`, {

        colors: ["blue", "white"],

        font: "simple"
    })

    const application = await Application.initialize(config.name, config.displayName, config.version, config.storage, resolve("assets/default-icon.png"))

    // One server, five doors, each at its own name. A program's client
    // is still not the API — it is files a browser reads, with no link,
    // no authorization and no operations — but a separate port was a
    // second address for one machine. The names keep them apart.
    const server = new Hono()

    server.route(doors.link, link(application, debugging))

    server.route(doors.proxy, proxy(application))

    server.route(doors.storage, storage(application))

    server.route(doors.uploads, uploads(application))

    server.route(doors.program, program(application))

    if (config.assets) server.use("*", serveStatic({ root: config.assets }))

    const port = config.port ?? await getPort()

    const hostname = config.hostname ?? "localhost"

    await new Promise(function (resolve) {

        serve({

            port,

            hostname,

            fetch: server.fetch,

            websocket: {

                server: new WebSocketServer({ noServer: true })
            }

        }, resolve)
    })

    // Local program intake beside the way the network reaches the system.
    // Not HTTP: it is a filesystem socket reachable only from this machine,
    // for installing or running the one program a local project declares.
    const socket = await intake(application, application.storage.join("intake.sock"))

    const origin = `http://localhost:${port}`

    if (config.assets) console.log(`  ➜  ${styleText("bold", "Desktop:")} ${origin}`)

    console.log(`  ➜  ${styleText("bold", "Intake:")} ${socket}`)

    return { origin }
}

export interface Config {

    name: string

    displayName: string

    version: string

    mode: "development" | "production"

    /** Explicit instance storage. Omission selects the real user installation. */
    storage?: string

    assets?: string

    hostname?: string

    port?: number
}

/** Read the optional public port override named from the application identity. */
export function environmentPort(name: string, variables: NodeJS.ProcessEnv) {

    const selected = environment(name, "PORT", variables)

    const value = selected.value

    if (value === undefined) return undefined

    if (!/^[0-9]+$/.test(value)) throw new Error(`${selected.key} must be an integer from 1 to 65535`)

    const port = Number(value)

    if (port < 1 || port > 65_535) throw new Error(`${selected.key} must be an integer from 1 to 65535`)

    return port
}

/** Read an optional absolute home for an isolated development instance. */
export function environmentHome(name: string, variables: NodeJS.ProcessEnv) {

    const selected = environment(name, "HOME", variables)

    const value = selected.value

    if (value === undefined) return undefined

    if (!isAbsolute(value)) throw new Error(`${selected.key} must be an absolute filesystem path`)

    return value
}
