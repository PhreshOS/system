import Application from "@server/core/application"
import { serveStatic } from "@hono/node-server/serve-static"
import { serve } from "@hono/node-server"
import { WebSocketServer } from "ws"
import doors from "./doors"
import gateway from "./gateway/gateway"
import gatewayAddress from "./gateway/address"
import program from "./program"
import proxy from "./proxy"
import storage from "./storage"
import uploads from "./uploads"
import link from "./link"
import getPort from "get-port"
import cfonts from "cfonts"
import { Hono } from "hono"
import { isAbsolute, normalize, resolve } from "node:path"
import { readFile, rm } from "node:fs/promises"
import { styleText } from "node:util"
import environment from "@libs/environment"

export default async function (config: Config) {

    const debugging = config.mode === "development"

    cfonts.say(`${config.displayName} v${config.version}`, {

        colors: ["blue", "white"],

        font: "simple"
    })

    const application = await Application.initialize(config.name, config.displayName, config.version, config.home, resolve("assets/default-icon.png"))

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

    const localGateway = await gateway(application, gatewayAddress(application.storage.path))

    const origin = `http://localhost:${port}`

    if (config.assets) console.log(`  ➜  ${styleText("bold", "Desktop:")} ${origin}`)

    console.log(`  ➜  ${styleText("bold", "Gateway:")} ${localGateway.path}`)

    return { origin }
}

export interface Config {

    name: string

    displayName: string

    version: string

    mode: "development" | "production"

    /** Absolute authoritative state root selected by Main. */
    home: string

    assets?: string

    hostname?: string

    port?: number
}

/** Read the stable fallback home supplied by the native service definition. */
export function defaultHome(arguments_: string[]) {

    const positions = arguments_.flatMap((value, index) => value === "--default-home" ? [index] : [])

    if (positions.length === 0) return undefined
    if (positions.length !== 1) throw new Error("--default-home can be supplied only once")

    const value = arguments_[positions[0]! + 1]

    if (!value || !isAbsolute(value)) throw new Error("--default-home must be followed by an absolute filesystem path")

    return normalize(value)
}

/** Consume the optional one-time home request supplied through the native service boundary. */
export async function requestedHome(arguments_: string[]) {

    const positions = arguments_.flatMap((value, index) => value === "--home-request" ? [index] : [])

    if (positions.length === 0) return undefined
    if (positions.length !== 1) throw new Error("--home-request can be supplied only once")

    const path = arguments_[positions[0]! + 1]

    if (!path || !isAbsolute(path)) throw new Error("--home-request must be followed by an absolute filesystem path")

    let value: string

    try { value = (await readFile(path, "utf8")).trim() }
    catch (error) {

        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
        throw error
    }

    await rm(path, { force: true })

    if (!isAbsolute(value)) throw new Error("The requested PhreshOS home must be an absolute filesystem path")

    return normalize(value)
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

/** Read the optional absolute authoritative home selected by Main's environment. */
export function environmentHome(name: string, variables: NodeJS.ProcessEnv) {

    const selected = environment(name, "HOME", variables)

    const value = selected.value

    if (value === undefined) return undefined

    if (!isAbsolute(value)) throw new Error(`${selected.key} must be an absolute filesystem path`)

    return resolve(value)
}
