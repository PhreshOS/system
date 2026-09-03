import { serveStatic } from "@hono/node-server/serve-static"
import Application from "@server/core/application"
import { isIconSize } from "@server/core/link-manager/auth-manager/program-manager/icon"
import { existsSync } from "node:fs"
import { Hono } from "hono"
import doors from "../doors"
import { developmentResponse, developmentSocket, developmentTarget } from "./development"

/**
 * The browser representation of one Program domain.
 *
 * Every Client document uses `/program/<assetId>/assets`, independently of
 * whether its source is an installed directory or a live development server.
 * Icons use the same asset identity beneath `/program/<assetId>/icons`.
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

    program.get("/:assetId{[0-9a-f-]{36}}/assets", context => context.redirect(`${new URL(context.req.url).pathname}/`))

    // A development Client's WebSocket is the same asset source as its HTTP
    // documents. Bridging it here keeps HMR beneath the Program asset address.
    program.use("/:assetId{[0-9a-f-]{36}}/assets/:path{.*}", async (context, next) => {

        if (context.req.header("upgrade")?.toLowerCase() !== "websocket") return await next()

        const found = programManager.fromAsset(context.req.param("assetId") ?? "")

        if (!found) return context.text("Unknown program", 404)

        const target = developmentTarget(found, context.req.url)

        if (!target) return context.text("The program has no development Client", 404)

        return developmentSocket(context, target)
    })

    program.all("/:assetId{[0-9a-f-]{36}}/assets/:path{.*}", async context => {

        const assetId = context.req.param("assetId") ?? ""

        const found = programManager.fromAsset(assetId)

        if (!found) return context.text("Unknown program", 404)

        const target = developmentTarget(found, context.req.url)

        if (target) return await developmentResponse(context, target)

        const root = found.clientPath

        // A retained Program may outlive files removed by uninstall(false).
        if (!root || !existsSync(root)) return context.text("The program has no assets", 404)

        return await serveStatic({

            root,

            rewriteRequestPath: path => path.slice(`${doors.program}/${assetId}/assets`.length)

        })(context, async () => undefined)
    })

    program.get("/:assetId{[0-9a-f-]{36}}/icons/:file", async context => {

        const found = programManager.fromAsset(context.req.param("assetId") ?? "")

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
