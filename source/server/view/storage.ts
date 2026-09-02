import { MissingAreaEntryError, NotFileError } from "@libs/file-area"
import { type StorageRequest } from "@server/core/protocol/storage"
import { unframe } from "@libs/framing"
import Application from "@server/core/application"
import { Hono } from "hono"

/** The authorized byte-stream door for System and Program storage. */
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

            const metadata = request.metadata
            const { operation, path } = metadata

            if (operation === "stream") {

                await request.body.cancel()

                const body = metadata.scope === "system"
                    ? application.home.stream(path)
                    : authManager.streamArea(authorization, metadata.program, metadata.area, path)

                return new Response(body, {

                    headers: {

                        "cache-control": "no-store",

                        "content-type": "application/octet-stream"
                    }
                })
            }

            if (metadata.scope === "system") await application.home.write(path, request.body, context.req.raw.signal)
            else await authManager.writeArea(authorization, metadata.program, metadata.area, path, request.body, context.req.raw.signal)

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

    if (request.scope !== "system" && request.scope !== "program") throw new Error("A storage request scope is system or program")
    if (request.scope === "program" && !isProgramAddress(request.program)) throw new Error("A Program storage request needs a Program handle")
    if (request.scope === "program" && request.area !== "data" && request.area !== "cache") throw new Error("A storage area is data or cache")

    if (request.operation !== "stream" && request.operation !== "write") throw new Error("A storage operation is stream or write")

    if (!Array.isArray(request.path) || request.path.some(part => typeof part !== "string")) throw new Error("A storage path is a list of names")
}

function isProgramAddress(value: unknown): value is { identity: string, reference: string } {

    return typeof value === "object" && value !== null && !Array.isArray(value)
        && "identity" in value && typeof value.identity === "string"
        && "reference" in value && typeof value.reference === "string"
}
