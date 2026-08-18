import { MissingAreaEntryError, NotFileError } from "@libs/file-area"
import { type StorageRequest } from "@server/core/protocol/storage"
import { unframe } from "@libs/framing"
import Application from "@server/core/application"
import { Hono } from "hono"

/** The desktop-authorized byte stream into or out of a Program area. */
export default function (application: Application) {

    const { authManager } = application.linkManager

    const storage = new Hono()

    storage.post("/", async function (context) {

        const authorization = context.req.header("authorization")

        try {

            authManager.verify(authorization)
        }

        catch (exception) {

            return context.text(exception instanceof Error ? exception.message : "Unauthorized", 401)
        }

        let request: Awaited<ReturnType<typeof unframe<StorageRequest>>>

        try {

            request = await unframe<StorageRequest>(context.req.raw.body)

            validate(request.metadata)
        }

        catch (exception) {

            return context.text(exception instanceof Error ? exception.message : "The storage request is invalid", 400)
        }

        try {

            const { area, operation, path, program } = request.metadata

            if (operation === "stream") {

                await request.body.cancel()

                return new Response(authManager.streamArea(authorization, program, area, path), {

                    headers: {

                        "cache-control": "no-store",

                        "content-type": "application/octet-stream"
                    }
                })
            }

            await authManager.writeArea(authorization, program, area, path, request.body, context.req.raw.signal)

            return new Response(null, { status: 204 })
        }

        catch (exception) {

            if (exception instanceof MissingAreaEntryError) return context.text(exception.message, 404)

            if (exception instanceof NotFileError) return context.text(exception.message, 400)

            if (exception instanceof Error && exception.message === "Unauthorized") return context.text(exception.message, 401)

            if (exception instanceof Error && (exception.message.includes("may not leave its area") || exception.message.includes("Writing takes"))) {

                return context.text(exception.message, 400)
            }

            console.error(exception)

            return context.text("The storage operation failed", 500)
        }
    })

    return storage
}

function validate(request: StorageRequest) {

    if (!request || typeof request !== "object") throw new Error("A storage request is required")

    if (typeof request.program !== "string") throw new Error("A storage request needs a Program")

    if (request.area !== "data" && request.area !== "cache") throw new Error("A storage area is data or cache")

    if (request.operation !== "stream" && request.operation !== "write") throw new Error("A storage operation is stream or write")

    if (!Array.isArray(request.path) || request.path.some(part => typeof part !== "string")) throw new Error("A storage path is a list of names")
}
