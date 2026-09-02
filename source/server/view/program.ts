import { serveStatic } from "@hono/node-server/serve-static"
import Application from "@server/core/application"
import { isIconSize } from "@server/core/link-manager/auth-manager/program-manager/icon"
import { existsSync } from "node:fs"
import doors from "./doors"
import { Hono } from "hono"

/**
 * What a program shows: its client half at `/program/<assetId>/assets`,
 * and how it is drawn at `/program/<assetId>/icons`.
 *
 * The asset id is a private runtime address, separate from public
 * program identity. Both are reachable only while the runtime registry
 * retains the program.
 *
 * No authorization: these are files a browser reads, with no link and
 * no operations. Nothing here can be found from a program's stable
 * identity.
 */
export default function (application: Application) {

    const { programManager } = application.linkManager.authManager

    const program = new Hono()

    // A client is entered at its directory: the trailing slash makes
    // the page's relative assets resolve beneath it.
    program.get("/:assetId{[0-9a-f-]{36}}/assets", context => context.redirect(`${new URL(context.req.url).pathname}/`))

    program.use("/:assetId{[0-9a-f-]{36}}/assets/:path{.*}", async (context, next) => {

        const assetId = context.req.param("assetId") ?? ""

        const found = programManager.fromAsset(assetId)

        if (!found) return context.text("Unknown program", 404)

        const root = found.clientPath

        // A retained Program may outlive files removed by uninstall(false).
        if (!root || !existsSync(root)) return context.text("The program has no assets", 404)

        return await serveStatic({

            root,

            rewriteRequestPath: path => path.slice(`${doors.program}/${assetId}/assets`.length)

        })(context, next)
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
