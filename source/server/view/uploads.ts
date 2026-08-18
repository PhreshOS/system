import { serveStatic } from "@hono/node-server/serve-static"
import { MissingServedValueError, ServedValueTooLargeError, serveLimit } from "@server/core/served-file-manager"
import Application from "@server/core/application"
import doors from "./doors"
import { Hono } from "hono"

/**
 * The door bytes come through, and the one they go back out of.
 *
 * Transport only: making a value public is an authorized operation on the
 * auth manager. Reading the completed file needs no authorization.
 *
 * The request body remains a stream all the way into ServedFileManager. Declared
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

        if (Number(context.req.header("content-length")) > serveLimit) return context.text(new ServedValueTooLargeError().message, 413)

        try {

            const type = context.req.header("content-type") ?? null

            const served = await authManager.serve(

                authorization,

                context.req.raw.body,

                type,

                extension(filename(context.req.header("content-disposition"))) ?? typeExtension(type),

                context.req.raw.signal
            )

            return context.json(served)
        }

        catch (exception) {

            if (exception instanceof MissingServedValueError) return context.text(exception.message, 400)

            if (exception instanceof ServedValueTooLargeError) return context.text(exception.message, 413)

            if (exception instanceof Error && exception.message === "Unauthorized") return context.text(exception.message, 401)

            console.error(exception)

            return context.text("The value could not be served", 500)
        }
    })

    uploads.use("/:file", async function (context, next) {

        await next()

        context.header("Access-Control-Allow-Origin", "*")
    })

    uploads.use("/:file", serveStatic({

        root: application.servedFiles.fileManager.path,

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
