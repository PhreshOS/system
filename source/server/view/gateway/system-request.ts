import type Application from "@server/core/application"
import SystemControl from "./system-control"

const adapters = new WeakMap<Application, SystemControl>()

/** Execute a short owner-local System request. */
export default async function systemRequest(application: Application, request: unknown, signal: AbortSignal) {

    let adapter = adapters.get(application)

    if (!adapter) {

        adapter = new SystemControl(application.system)
        adapters.set(application, adapter)
    }

    return adapter.execute(request, signal)
}
