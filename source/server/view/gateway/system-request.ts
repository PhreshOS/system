import type Application from "@server/core/application"

/** Execute a short owner-local System request. */
export default async function systemRequest(application: Application, request: unknown, signal: AbortSignal) {

    return application.systemControl.execute(request, signal)
}
