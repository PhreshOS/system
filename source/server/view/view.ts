import Application from "@server/core/application"
import { serveStatic } from "@hono/node-server/serve-static"
import { createAdaptorServer } from "@hono/node-server"
import { WebSocketServer } from "ws"
import doors from "./http/doors"
import gateway from "./gateway/gateway"
import gatewayAddress from "./gateway/address"
import program from "./http/program/program"
import proxy from "./http/proxy"
import storage from "./http/storage"
import uploads from "./http/uploads"
import link from "./http/link"
import cfonts from "cfonts"
import { Hono } from "hono"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { systemWallpapers } from "@phreshos/core"
import logo from "@/assets/logo.png?url"
import defaultIcon from "@/assets/default-icon.png?url"
import signInLightWallpaper from "@/assets/wallpapers/SIGN_IN_LIGHT_WALLPAPER.webp?url"
import signInDarkWallpaper from "@/assets/wallpapers/SIGN_IN_DARK_WALLPAPER.webp?url"
import desktopLightWallpaper from "@/assets/wallpapers/DESKTOP_LIGHT_WALLPAPER.webp?url"
import desktopDarkWallpaper from "@/assets/wallpapers/DESKTOP_DARK_WALLPAPER.webp?url"
import { writeFile } from "node:fs/promises"
import { styleText } from "node:util"
import { listenOnPorts } from "./configuration"
import { name, version } from "@/source/identity"

export default async function (config: Config) {

    const debugging = config.mode === "development"

    cfonts.say(`${name} v${version}`, {

        colors: ["blue", "white"],

        font: "simple"
    })

    const application = await Application.initialize(config.home, { system: assetFile(logo), defaultProgram: assetFile(defaultIcon) }, {
        [systemWallpapers.light.signIn]: assetFile(signInLightWallpaper),
        [systemWallpapers.dark.signIn]: assetFile(signInDarkWallpaper),
        [systemWallpapers.light.desktop]: assetFile(desktopLightWallpaper),
        [systemWallpapers.dark.desktop]: assetFile(desktopDarkWallpaper)
    })

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

    await writeFile(join(application.storage.path, "desktop"), `${origin}\n`, { mode: 0o600 })

    const localGateway = await gateway(application.linkManager, gatewayAddress(application.storage.path))

    if (config.assets) console.log(`  ➜  ${styleText("bold", "Desktop:")} ${origin}`)

    console.log(`  ➜  ${styleText("bold", "Gateway:")} ${localGateway.path}`)

    return { origin }
}

export interface Config {

    mode: "development" | "production"

    /** Absolute authoritative state root selected by Main. */
    home: string

    assets?: string

    hostname?: string

    /** Ordered public port candidates. Omit to let the operating system assign one. */
    ports?: readonly number[]
}

/**
 * The file on disk behind a `?url` import. Vite addresses it under `/@fs/` in development, and
 * beside the built server once built.
 */
function assetFile(url: string) {

    return url.startsWith("/@fs/") ? url.slice("/@fs".length) : fileURLToPath(new URL(`.${url}`, import.meta.url))
}
