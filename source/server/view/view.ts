import Application from "@server/core/application"
import { serveStatic } from "@hono/node-server/serve-static"
import { createAdaptorServer, type ServerType } from "@hono/node-server"
import { WebSocketServer } from "ws"
import doors from "./doors"
import gateway from "./gateway/gateway"
import gatewayAddress from "./gateway/address"
import program from "./program"
import proxy from "./proxy"
import storage from "./storage"
import uploads from "./uploads"
import link from "./link"
import cfonts from "cfonts"
import { Hono } from "hono"
import { isAbsolute, normalize, resolve } from "node:path"
import { readFile, rm, writeFile } from "node:fs/promises"
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

    const hostname = config.hostname ?? "localhost"

    const listener = createAdaptorServer({

        fetch: server.fetch,

        websocket: {

            server: new WebSocketServer({ noServer: true })
        }
    })

    const port = await listenOnPorts(listener, hostname, config.ports)

    const origin = `http://localhost:${port}`

    await writeFile(resolve(application.storage.path, "desktop"), `${origin}\n`, { mode: 0o600 })

    const localGateway = await gateway(application, gatewayAddress(application.storage.path))

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

    /** Ordered public port candidates. Omit to let the operating system assign one. */
    ports?: readonly number[]
}

/** Expand one inclusive TCP port range. */
export function portRange(from: number, to: number) {

    return Array.from({ length: to - from + 1 }, (_, index) => from + index)
}

/** Read the optional ordered production port selection. */
export function environmentPorts(name: string, variables: NodeJS.ProcessEnv) {

    const selected = environment(name, "PORT", variables)

    if (selected.value === undefined) return undefined

    return parsePorts(selected.value, selected.key)
}

/** Parse comma-separated TCP ports and inclusive ranges in declared order. */
export function parsePorts(value: string, name = "Port selection") {

    const ports: number[] = []

    const included = new Set<number>()

    for (const part of value.split(",")) {

        const match = /^(\d+)(?:-(\d+))?$/.exec(part)

        if (!match) throw portSelectionError(name)

        const from = Number(match[1])

        const to = Number(match[2] ?? match[1])

        if (!validPort(from) || !validPort(to) || from > to) throw portSelectionError(name)

        for (let port = from; port <= to; port++) {

            if (included.has(port)) continue

            included.add(port)

            ports.push(port)
        }
    }

    return Object.freeze(ports)
}

/** Consume the optional one-time port selection supplied through the native service boundary. */
export async function requestedPorts(arguments_: string[]) {

    const positions = arguments_.flatMap((value, index) => value === "--port-request" ? [index] : [])

    if (positions.length === 0) return undefined

    if (positions.length !== 1) throw new Error("--port-request can be supplied only once")

    const path = arguments_[positions[0]! + 1]

    if (!path || !isAbsolute(path)) throw new Error("--port-request must be followed by an absolute filesystem path")

    let value: string

    try { value = (await readFile(path, "utf8")).trim() }

    catch (error) {

        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined

        throw error
    }

    await rm(path, { force: true })

    return parsePorts(value, "The requested PhreshOS port selection")
}

/** Bind one server to the first available candidate or an assigned port. */
export async function listenOnPorts(server: ServerType, hostname: string, ports?: readonly number[]) {

    for (const port of ports ?? [0]) {

        const address = await tryListen(server, hostname, port)

        if (address !== null) return address
    }

    throw new Error("No configured System port is available")
}

function tryListen(server: ServerType, hostname: string, port: number) {

    return new Promise<number | null>((resolve, reject) => {

        const failed = (error: NodeJS.ErrnoException) => {

            server.off("error", failed)

            if (error.code === "EADDRINUSE" || error.code === "EACCES") resolve(null)

            else reject(error)
        }

        server.once("error", failed)

        server.listen(port, hostname, () => {

            server.off("error", failed)

            const address = server.address()

            if (!address || typeof address === "string") reject(new Error("The System listener has no TCP address"))

            else resolve(address.port)
        })
    })
}

function validPort(value: number) {

    return Number.isInteger(value) && value >= 1 && value <= 65_535
}

function portSelectionError(name: string) {

    return new Error(`${name} must contain ports or inclusive ranges from 1 to 65535`)
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
/** Read the optional absolute authoritative home selected by Main's environment. */
export function environmentHome(name: string, variables: NodeJS.ProcessEnv) {

    const selected = environment(name, "HOME", variables)

    const value = selected.value

    if (value === undefined) return undefined

    if (!isAbsolute(value)) throw new Error(`${selected.key} must be an absolute filesystem path`)

    return resolve(value)
}
