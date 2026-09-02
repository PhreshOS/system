import { serveStatic } from "@hono/node-server/serve-static"
import Application from "@server/core/application"
import { isIconSize } from "@server/core/link-manager/auth-manager/program-manager/icon"
import { existsSync } from "node:fs"
import { Hono } from "hono"
import doors from "./doors"
import { developmentResponse, developmentSocket, developmentTarget } from "./program-development"

/**
 * The browser representation of one Program domain.
 *
 * Every Client document uses `/program/<identity>/assets`, independently of
 * whether its source is an installed directory or a live development server.
 * Icons use the same Program identity beneath `/program/<identity>/icons`.
 */
export default function (application: Application) {

    const { programManager } = application.linkManager.authManager

    const program = new Hono()

    // The hidden Desktop probe deliberately asks from an opaque origin. Keep
    // this header on every Program response so an outer reverse proxy becomes
    // part of the same observable hosting contract.
    program.use("*", async (context, next) => {

        await next()

        context.header("Access-Control-Allow-Origin", "*")
    })

    program.get("/ping", context => {

        context.header("Cache-Control", "no-store")

        return context.text("Program assets are available")
    })

    program.get("/:identity/assets", context => context.redirect(`${new URL(context.req.url).pathname}/`))

    // A development Client's WebSocket is the same asset source as its HTTP
    // documents. Bridging it here keeps HMR beneath the Program asset address.
    program.use("/:identity/assets/:path{.*}", async (context, next) => {

        if (context.req.header("upgrade")?.toLowerCase() !== "websocket") return await next()

        const found = programManager.reach(context.req.param("identity"))

        if (!found) return context.text("Unknown program", 404)

        const target = developmentTarget(found, context.req.url)

        if (!target) return context.text("The program has no development Client", 404)

        return developmentSocket(context, target)
    })

    program.all("/:identity/assets/:path{.*}", async context => {

        const identity = context.req.param("identity")

        const found = programManager.reach(identity)

        if (!found) return context.text("Unknown program", 404)

        const target = developmentTarget(found, context.req.url)

        if (target) return await developmentResponse(context, target)

        const root = found.clientPath

        // A retained Program may outlive files removed by uninstall(false).
        if (!root || !existsSync(root)) return context.text("The program has no assets", 404)

        return await serveStatic({

            root,

            rewriteRequestPath: path => path.slice(`${doors.program}/${identity}/assets`.length)

        })(context, async () => undefined)
    })

    program.get("/:identity/icons/:file", async context => {

        const found = programManager.reach(context.req.param("identity"))

        if (!found) return context.text("Unknown program", 404)

        const file = context.req.param("file") ?? ""

        const size = file.endsWith(".png") ? file.slice(0, -4) : ""

        if (!isIconSize(size)) return context.text("Unknown icon size", 404)

        context.header("Cache-Control", "no-cache")

        context.header("Content-Type", "image/png")

        return context.body(Uint8Array.from(await programManager.icon(found, size)))
    })

    return program
}
