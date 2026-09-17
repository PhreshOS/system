import { serveStatic } from "@hono/node-server/serve-static"
import { MissingUploadValueError, UploadTooLargeError, uploadLimit } from "@server/core/upload-manager"
import Application from "@server/core/application"
import doors from "./doors"
import { Hono } from "hono"
import { isUploadFile } from "@phreshos/core"
import { readFile } from "node:fs/promises"
import { wallpaperKind, wallpaperSizeLimit } from "@shared/wallpaper"

const immutableCache = "public, max-age=31536000, immutable"

const wallpaperPolicy = [
    "default-src 'none'",
    "script-src 'unsafe-inline' data: blob:",
    "style-src 'unsafe-inline' data: blob:",
    "img-src data: blob:",
    "media-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "worker-src data: blob:",
    "object-src 'none'",
    "frame-src data: blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "sandbox allow-scripts"
].join("; ")

/**
 * The door bytes come through, and the one they go back out of.
 *
 * Transport only: making a value public is an authorized operation on the
 * auth manager. Reading the completed file needs no authorization.
 *
 * The request body remains a stream all the way into UploadManager. Declared
 * oversize bodies are refused before reading; undeclared ones are counted as
 * they arrive, with incomplete temporary files removed on every failure.
 */
export default function (application: Application) {

    const { authManager } = application.linkManager

    const uploads = new Hono()

    uploads.post("/", async function (context) {

        const authorization = context.req.header("authorization")

        try {

            authManager.verify(authorization)
        }

        catch (exception) {

            return context.text(exception instanceof Error ? exception.message : "Unauthorized", 401)
        }

        if (Number(context.req.header("content-length")) > uploadLimit) return context.text(new UploadTooLargeError().message, 413)

        try {

            const upload = await authManager.upload(

                authorization,

                context.req.raw.body,

                extension(filename(context.req.header("content-disposition"))) ?? typeExtension(context.req.header("content-type") ?? null),

                context.req.raw.signal
            )

            return context.json(upload)
        }

        catch (exception) {

            if (exception instanceof MissingUploadValueError) return context.text(exception.message, 400)

            if (exception instanceof UploadTooLargeError) return context.text(exception.message, 413)

            if (exception instanceof Error && exception.message === "Unauthorized") return context.text(exception.message, 401)

            console.error(exception)

            return context.text("The value could not be uploaded", 500)
        }
    })

    uploads.get("/:file/stat", function (context) {

        try {

            const upload = application.uploads.stat(context.req.param("file"))

            if (!upload) return context.body(null, 404)

            context.header("Cache-Control", immutableCache)

            return context.json(upload)
        }

        catch (error) {

            return context.text(error instanceof Error ? error.message : "Invalid upload", 400)
        }
    })

    uploads.get("/wallpaper/:file", async function (context) {
        const file = context.req.param("file")

        if (!isUploadFile(file)) return context.text("That is not an upload file", 400)
        if (wallpaperKind(file) !== "html") return context.text("That upload is not an HTML wallpaper", 400)

        try {
            const upload = application.uploads.stat(file)

            if (!upload) return context.body(null, 404)
            if (upload.size > wallpaperSizeLimit) return context.text("A wallpaper cannot exceed 50 MiB", 413)

            context.header("Content-Security-Policy", wallpaperPolicy)
            context.header("Content-Type", "text/html; charset=utf-8")
            context.header("X-Content-Type-Options", "nosniff")
            context.header("Cache-Control", immutableCache)

            return context.body(Uint8Array.from(await readFile(application.uploads.path(file))))
        }

        catch (error) {
            return context.text(error instanceof Error ? error.message : "Invalid wallpaper", 400)
        }
    })

    uploads.use("/:file", async function (context, next) {

        const file = context.req.param("file")

        if (!isUploadFile(file)) return context.text("That is not an upload file", 400)

        try {

            if (!application.uploads.stat(file)) return context.body(null, 404)
        }

        catch (error) {

            return context.text(error instanceof Error ? error.message : "Invalid upload", 400)
        }

        await next()

        context.header("Cache-Control", immutableCache)
        context.header("Access-Control-Allow-Origin", "*")
    })

    uploads.use("/:file", serveStatic({

        root: application.uploads.fileManager.path,

        rewriteRequestPath: path => path.slice(doors.uploads.length + 1)
    }))

    return uploads
}

// The standard place a filename travels when a body is raw bytes.
function filename(disposition: string | undefined) {

    const found = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)

    return found ? decodeURIComponent(found[1]) : null
}

// What a file is, as far as its name says. The name itself is not kept:
// it came from a browser, and the extension is the only part of it that
// identifies anything.
function extension(name: string | null) {

    const found = name?.match(/\.([A-Za-z0-9]+)$/)

    return found?.[1]?.toLowerCase() ?? null
}

function typeExtension(type: string | null) {

    if (type?.split(";", 1)[0]?.toLowerCase() === "text/plain") return "txt"

    if (type?.split(";", 1)[0]?.toLowerCase() === "application/json") return "json"

    return "bin"
}
