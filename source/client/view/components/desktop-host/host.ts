import {
    type DesktopSurfaceSnapshot,
    type Launch
} from "@phreshos/core"
import { type ProxyRequest } from "@server/core/protocol/proxy"
import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { type ClientBody, type ProxiedResponse, type UploadValue } from "@client/core/application"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"
import { sdkProcess, sdkProgram } from "./sdk-records"
import { type default as ClientProgram } from "@client/core/link-manager/auth-manager/program-manager/program"
import { type default as ClientProcess } from "@client/core/link-manager/auth-manager/process-manager/process"
import {
    isServiceKey,
    isUploadFile,
    parsePermissionName,
    type DesktopPreferencesUpdate,
    type PermissionInput,
    type PermissionRequest,
    type ProgramIconSize
} from "@phreshos/core"
import {
    localGeometry,
    localPosition,
    localSize,
    requireLocalWindowLayer,
    visualTransaction,
    type LocalWindowHost
} from "./local-window"
import SystemAccess from "./system-access"

/** A host answer whose stream must be transferred rather than cloned. */
export class TransferredAnswer {

    public constructor(public readonly result: unknown[], public readonly transfer: Transferable[]) { }
}

/** Adapts the complete System contract and contextual Desktop capabilities to one Client frame. */
export default function host(authManager: AuthManager, pane: string, desktop: () => DesktopSurfaceSnapshot, frameOwner: () => string | null, localWindow: LocalWindowHost) {

    const { processManager, programManager } = authManager

    const access = new SystemAccess(authManager, pane)

    function process() {

        const found = processManager.processes.get(pane)

        if (!found) throw new Error("The desktop does not know this process")

        return found
    }

    function programOf(found: Pick<ClientProcess, "program">) {

        const program = programManager.programs.get(found.program)

        if (!program) throw new Error("The desktop does not know this program")

        return program
    }

    function requireProgram(identity: string) {

        const program = programManager.programs.get(identity)

        if (!program) throw new Error("The desktop does not know this program")

        return program
    }

    function holdProgram(value: unknown, fallback: ClientProgram = programOf(process())) {

        if (value === undefined || value === null) return fallback
        if (!isHandleAddress(value)) throw new Error("A Program handle is required")

        const found = programManager.programs.get(value.identity)

        if (!found || found.reference !== value.reference) throw new Error("The Program represented by this handle does not exist")

        return found
    }

    function holdProcess(value: unknown, fallback: ClientProcess = process()) {

        if (value === undefined || value === null) return fallback
        if (!isHandleAddress(value)) throw new Error("A Process handle is required")

        const found = processManager.processes.get(value.identity)

        if (!found || found.reference !== value.reference) throw new Error("The Process represented by this handle does not exist")

        return found
    }

    function permittedProgram(value: unknown) {

        return access.program(holdProgram(value))
    }

    function permittedProcess(value: unknown) {

        return access.process(holdProcess(value))
    }

    function permittedService(value: unknown) {

        if (!isServiceKey(value)) throw new Error("A complete service key is required")

        return access.service(value)
    }

    function resolveProcess(value: unknown) {

        if (!isHandleAddress(value)) return null

        const found = processManager.processes.get(value.identity)

        return found?.reference === value.reference ? found : null
    }

    function requireProcess(identity: string) {

        const found = processManager.processes.get(identity)

        if (!found) throw new Error("The desktop does not know this process")

        return found
    }

    function clientOf(found: ClientProcess) {

        if (!found.client) throw new Error("This process has no live client endpoint")

        return found.client
    }

    function localProcess(value: unknown) {

        const found = holdProcess(value)

        if (found !== process()) throw new Error("Local Window operations belong to the current Client Context")

        clientOf(found)

        return found
    }

    // One process record on every road. Nullable values carry the resolved
    // shape as data; the SDK turns them into permanent addressed ends whose
    // exists() reads the latest fact. A frame receives MessagePack data, never
    // the desktop's mutable record.
    function record(found: ClientProcess) {

        return sdkProcess(found, programOf(found))
    }

    return async function answer(word: unknown, ...args: unknown[]) {

        // When it started is a fact about this process, which a pane may
        // already ask everything else about — it was missing on this side
        // only because it was added on the other.
        if (word === "current-process") return [record(process())]

        if (word === "host-program-list") {

            const programs = [...programManager.programs.values()].filter(program => args[0] !== true || program.installed)
            const visible = []

            for (const program of programs) if (await access.canProgram(program)) visible.push(program)

            return [visible.map(sdkProgram)]
        }

        if (word === "host-program-find") {

            const program = programManager.programs.get(String(args[0]))

            if (program) await access.program(program)

            return [program ? sdkProgram(program) : null]
        }

        if (word === "host-program-create" || word === "host-program-force-create") {

            await access.requirePrograms()

            const identity = word === "host-program-create"
                ? await programManager.create(args[0])
                : await programManager.forceCreate(args[0], pane)

            return [sdkProgram(requireProgram(identity))]
        }

        if (word === "host-process-list") {

            const processes = [...processManager.processes.values()]
            const visible = []

            for (const process of processes) if (await access.canProcess(process)) visible.push(process)

            return [visible.map(record)]
        }

        if (word === "host-process-find") {

            const found = processManager.processes.get(String(args[0]))

            if (found) await access.process(found)

            return [found ? record(found) : null]
        }

        if (word === "appearance") return [authManager.linkManager.appearance.value]

        if (word === "updateAppearance") {

            await access.require("appearance", [])

            await authManager.updateAppearance(args[0])

            return []
        }

        if (word === "desktopPreferences") return [authManager.linkManager.desktopPreferences.value]

        if (word === "updateDesktopPreferences") {

            await access.require("desktopPreferences", [])

            const preferences = desktopPreferencesUpdate(args[0])

            await authManager.linkManager.requestDesktopPreferences(preferences)

            return []
        }

        if (word === "exists") {

            const target = await permittedProcess(args[1])

            if (args[0] === "server") return [target.server !== null]

            if (args[0] === "client") return [target.client !== null]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "start-endpoint") {

            const target = await permittedProcess(args[0])

            if (args[1] !== "server" && args[1] !== "client") throw new Error("A Process endpoint is server or client")

            await processManager.startEndpoint(target.identity, args[1], args[2] as never)

            return [target.identity]
        }

        if (word === "stop-endpoint") {

            const target = await permittedProcess(args[0])

            if (args[1] !== "server" && args[1] !== "client") throw new Error("A Process endpoint is server or client")

            await processManager.stopEndpoint(target.identity, args[1])

            return [target.identity]
        }

        if (word === "stop-current") {

            await processManager.stopEndpoint(process().identity, "client")

            return []
        }

        if (word === "is-service") {

            const target = await permittedProcess(args[1])
            const endpoint = args[0] ?? "client"

            if (endpoint !== "server" && endpoint !== "client") throw new Error("A Process endpoint is server or client")

            return [await processManager.endpointIsService(pane, address(target), endpoint)]
        }

        if (word === "service-exists") {

            const service = await permittedService(args[0])

            return [await processManager.serviceExists(service)]
        }

        if (word === "service-wait-ready") {

            const service = await permittedService(args[0])

            return [await processManager.waitServiceReady(service, args[1] as number | undefined)]
        }

        if (word === "service-follow") {

            const [subscription, key, scope, event] = args

            if (typeof subscription !== "string" || !isServiceKey(key)) return []

            if (scope !== "lifecycle" && scope !== "events") return []

            if (event !== null && typeof event !== "string") return []

            await access.service(key)

            const owner = frameOwner()

            if (owner) await processManager.followService(pane, owner, subscription, key, scope, event)

            return []
        }

        if (word === "service-unfollow") {

            const owner = frameOwner()

            if (owner) await processManager.unfollowService(pane, owner, String(args[0]))

            return []
        }

        if (word === "service-send") {

            if (!isServiceKey(args[0]) || typeof args[1] !== "string") return []

            const service = await access.service(args[0])

            await processManager.sendService(pane, service, args[1], args[2])

            return []
        }

        if (word === "service-ask") {

            if (!isServiceKey(args[0]) || args[0].endpoint !== "server") throw new Error("Only a Server service can be asked")

            const service = await access.service(args[0])

            await processManager.askService(pane, service, args.slice(1))

            return []
        }

        // A Process parent is resolved by its exact retained address.
        if (word === "parent") {

            const target = await permittedProcess(args[0])
            const parent = target.parent ? resolveProcess(target.parent) : null

            if (target.parent && !parent) throw new Error("The parent Process no longer exists")

            if (parent) await access.process(parent)

            return [parent ? record(parent) : null]
        }

        // A retained Process handle remains able to report its own ending.
        if (word === "exited") {

            if (!isHandleAddress(args[0])) throw new Error("The boundary returned an invalid Process handle")

            const current = resolveProcess(args[0])

            if (current) await access.process(current)

            return [current === null]
        }

        // Every live Process belonging to one exact Program handle.
        if (word === "program-process-list") {

            const program = await permittedProgram(args[0])

            return [[...processManager.processes.values()].filter(entry => entry.program === program.identity).map(record)]
        }

        // One process of this program by immutable identity or by its
        // living program-local name. An exact identity always wins.
        if (word === "program-process-find") {

            const program = await permittedProgram(args[0])
            const wanted = String(args[1])
            const exact = processManager.processes.get(wanted)
            const found = exact?.program === program.identity
                ? exact
                : [...processManager.processes.values()].find(entry => entry.program === program.identity && entry.name === wanted)

            return [found ? record(found) : null]
        }

        // Create another Process from one exact Program handle.
        if (word === "program-process-create") {

            const program = await permittedProgram(args[0])
            const started = await programManager.createProcess(address(program), args[1] as Launch, process().identity)

            return [record(requireProcess(started))]
        }

        if (word === "program-process-find-or-create") {

            const program = await permittedProgram(args[0])
            const launch = args[1] as Launch & { name: string }

            const found = await programManager.findOrCreateProcess(address(program), launch, process().identity)

            return [record(requireProcess(found))]
        }

        // Every instance ended, the asker last. One implementation on the
        // core serves this and a server half both.
        if (word === "program-process-exit-all") return [await processManager.exitAll((await permittedProgram(args[0])).identity, pane)]

        if (word === "observe") {

            const half = args[2]

            const kind = args[3]

            const reportImpossible = args[5] === true

            if (half !== "server" && half !== "client") throw new Error(`A process has no "${String(half)}" end`)

            if (!isTrafficKind(kind)) throw new Error(`The host does not know the traffic kind "${String(kind)}"`)

            const owner = frameOwner()

            const target = args[1] === null ? process() : resolveProcess(args[1])

            // Callback subscriptions are synchronous and remain silent when
            // their source is unavailable. waitFor() and events() identify
            // themselves as fallible, giving their boundary a real rejection
            // path when this synchronized Process record proves impossibility.
            if (!owner || !target) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

                return []
            }

            if (!await access.canProcess(target)) {

                if (reportImpossible) throw new Error("Execution is not permitted")

                return []
            }

            if (!programOf(target)[half]) {

                if (reportImpossible) throw new Error(`This program declared no ${half} half`)

                return []
            }

            const event = args[4]

            if (event !== null && typeof event !== "string") return []

            await processManager.observe(pane, owner, String(args[0]), address(target), half, kind, event, reportImpossible)

            return []
        }

        if (word === "unobserve") {

            const owner = frameOwner()

            if (owner) await processManager.unobserve(pane, owner, String(args[0]))

            return []
        }

        if (word === "follow") {

            const half = args[2]

            const reportImpossible = args[4] === true

            if (half !== "server" && half !== "client") throw new Error(`A process has no "${String(half)}" end`)

            const frame = frameOwner()

            const target = args[1] === null ? process() : resolveProcess(args[1])

            if (!frame || !target) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

                return []
            }

            if (!await access.canProcess(target)) {

                if (reportImpossible) throw new Error("Execution is not permitted")

                return []
            }

            if (!programOf(target)[half]) {

                if (reportImpossible) throw new Error(`This program declared no ${half} half`)

                return []
            }

            const event = args[3]

            if (event !== null && typeof event !== "string") return []

            await processManager.follow(pane, frame, String(args[0]), address(target), half, event, reportImpossible)

            return []
        }

        if (word === "unfollow") {

            const frame = frameOwner()

            if (frame) await processManager.unfollow(pane, frame, String(args[0]))

            return []
        }

        // Destinationless emission. The source comes from the frame boundary.
        if (word === "emit") {

            if (typeof args[0] !== "string") return []

            await processManager.emit(pane, args[0], args[1])

            return []
        }

        // Into one addressed Endpoint, with the current Client as source.
        if (word === "send") {

            if (args[1] !== "server" && args[1] !== "client") throw new Error(`A process has no "${String(args[1])}" end`)

            await processManager.publish(pane, (await permittedProcess(args[0])).identity, args[1], args.slice(2))

            return []
        }

        // Forwarded, and that is all. The pane wrote its own address
        // into the question and holds its own deadline; this side has
        // nothing to wait for and nothing to answer with.
        if (word === "ask") {

            if (args[1] !== "server") throw new Error("Only a server end can be asked — a client end has no one answerer")

            await processManager.askOf(pane, (await permittedProcess(args[0])).identity, args.slice(2))

            return []
        }

        // What a launch said. An empty subject is this frame's Process.
        if (word === "option") {

            const found = await permittedProcess(args[0])

            return [found.options[String(args[1])]]
        }

        // The Program belonging to the current Client Context.
        if (word === "current-program") {

            const program = programOf(process())

            // What it declared about its window comes too — the same
            // kind of fact as its name, and what a window needs to know
            // how large another instance of itself would open.
            return [sdkProgram(program)]
        }

        if (word === "context-permission-get") return [await authManager.permission(pane, parsePermissionName(args[0]))]

        if (word === "context-permission-request") {

            if (typeof args[0] !== "string") throw new Error("A permission request needs an identity")

            const permission = parsePermissionName(args[1])

            return [await authManager.requestPermission(pane, args[0], permission, args[2] as PermissionRequest<typeof permission>)]
        }

        if (word === "program-permissions") {

            await access.requireAll()

            const operation = args[1]

            if (operation !== "all" && operation !== "get" && operation !== "set" && operation !== "delete") throw new Error(`The System does not know the Program permission operation "${String(operation)}"`)

            if (operation === "all") return [await programManager.permissions(address(holdProgram(args[0])), operation)]

            const permission = parsePermissionName(args[2])

            return [await programManager.permissions(
                address(holdProgram(args[0])),
                operation,
                permission,
                args[3] as Exclude<PermissionInput<typeof permission>, null>
            )]
        }

        if (word === "startup") {

            const program = await permittedProgram(args[0])

            return [await programManager.startup(address(program), String(args[1]), args[2])]
        }

        if (word === "fork") {

            await access.requirePrograms()

            const identity = await programManager.fork(args[0], String(args[1]))
            const program = programManager.programs.get(identity)

            if (!program) throw new Error("The forked Program was not synchronized")

            return [sdkProgram(program)]
        }

        if (word === "program-agent") return [await programManager.agent(address(await permittedProgram(args[0])))]

        // Icon bytes are requested only when a concrete Program handle asks.
        if (word === "icon") return [await programManager.icon(address(await permittedProgram(args[0])), args[1] as ProgramIconSize)]

        // Installation state and lifecycle operations of one held Program.
        if (word === "installed") {

            return [(await permittedProgram(args[0])).installed === true]
        }

        if (word === "forget") {

            const program = await permittedProgram(args[0])

            return [await program.forget(pane)]
        }

        // How this pane is shown. Not `depth`: that is how the desktop
        // works out which window is at the front of its layer, and a
        // value that can be read but never acted on is a mechanism
        // rather than an answer. It is told `front`, which is what depth
        // was being used to ask.
        if (word === "window") {

            const target = await permittedProcess(args[0])
            const shown = clientOf(target).window

            return [{

                title: shown.title,

                position: shown.position,

                size: shown.size,

                minimized: shown.minimized,

                front: processManager.front(shown.layer) === target.identity,

                // Which layer it lives in, and which of its own pages it
                // was opened at. Both are the system's answers about
                // this window: a launch may put the same program in a
                // different layer or at a different page, so a program
                // cannot read either off its own description.
                layer: shown.layer,

                location: shown.location
            }]
        }

        if (word === "move") {

            await clientOf(await permittedProcess(args[0])).window.move(args[1] as never)

            return [pane]
        }

        if (word === "resize") {

            await clientOf(await permittedProcess(args[0])).window.resize(args[1] as never)

            return [pane]
        }

        if (word === "setGeometry") {

            await clientOf(await permittedProcess(args[0])).window.setGeometry(args[1] as never)

            return [pane]
        }

        if (word === "windowLocalMove") {

            const target = localProcess(args[0])
            requireLocalWindowLayer(target.client!.window.layer)
            await localWindow.move(target.identity, localPosition(args[1]), visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalResize") {

            const target = localProcess(args[0])
            requireLocalWindowLayer(target.client!.window.layer)
            await localWindow.resize(target.identity, localSize(args[1]), visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalGeometry") {

            const target = localProcess(args[0])
            requireLocalWindowLayer(target.client!.window.layer)
            await localWindow.geometry(target.identity, localGeometry(args[1]), visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalSurfaceAdd") {

            const target = localProcess(args[0])
            requireLocalWindowLayer(target.client!.window.layer)
            await localWindow.addSurface(target.identity, visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalSurfaceRemove") {

            const target = localProcess(args[0])
            requireLocalWindowLayer(target.client!.window.layer)
            await localWindow.removeSurface(target.identity, visualTransaction(args[2]))

            return []
        }

        if (word === "changeTitle") {

            await clientOf(await permittedProcess(args[0])).window.changeTitle(String(args[1] ?? ""))

            return [pane]
        }

        if (word === "raise") {

            await clientOf(await permittedProcess(args[0])).window.raise()

            return [pane]
        }

        if (word === "minimize") {

            await clientOf(await permittedProcess(args[0])).window.minimize(args[1] !== false)

            return [pane]
        }

        if (word === "exit") {

            await (await permittedProcess(args[0])).exit()

            return [pane]
        }

        if (word === "store") {

            const [subject, operation, key, value, ttl] = args as [unknown, string, string, unknown, number | undefined]

            return [await programManager.store(address(await permittedProgram(subject)), operation, key, value, ttl)]
        }

        // This program's places. Metadata operations remain ordinary values;
        // file content takes the storage door so its bytes never enter The
        // Link's serialization. The exact Program handle crosses with the
        // request and is validated again by the authoritative Core.
        if (word === "data" || word === "cache") {

            const area: "data" | "cache" = word === "data" ? "data" : "cache"

            const operation = String(args[1])

            const program = await permittedProgram(args[0])

            if (operation === "stream" || operation === "write") {

                const joins = args[2]

                if (!Array.isArray(joins) || joins.some(join => typeof join !== "string")) throw new Error("A storage path is a list of names")

                const { control, controller } = cancellation(args[4], operation)

                const request = { scope: "program" as const, program: address(program), area, path: joins }

                try {

                    if (operation === "write") {

                        if (!clientBody(args[3])) throw new Error("Writing takes bytes")

                        await authManager.linkManager.application.storageWrite(request, args[3], authManager.authorization, controller.signal)

                        control.close()

                        return []
                    }

                    const body = controlled(

                        await authManager.linkManager.application.storageStream(request, authManager.authorization, controller.signal),

                        controller,

                        control
                    )

                    return new TransferredAnswer([body], [body])
                }

                catch (exception) {

                    control.close()

                    throw exception
                }
            }

            return [await programManager.area(address(program), word, operation, args.slice(2))]
        }

        // Read-only logs belonging to one exact Program.
        if (word === "logs") {

            return [await programManager.logs(address(await permittedProgram(args[0])), String(args[1]), Array.isArray(args[2]) ? args[2] : [])]
        }

        // Read and write one exact Program database.
        if (word === "database") {

            return [await programManager.database(address(await permittedProgram(args[0])), String(args[1]), Array.isArray(args[2]) ? args[2] : [])]
        }

        if (word === "host-storage") {

            await access.requireAll()

            return [await authManager.storage(String(args[0]), args.slice(1).map(String))]
        }

        if (word === "host-storage-stream" || word === "host-storage-write") {

            await access.requireAll()

            const path = args[0]

            if (!Array.isArray(path) || path.some(part => typeof part !== "string")) throw new Error("A storage path is a list of names")

            const writing = word === "host-storage-write"
            const { control, controller } = cancellation(args[2], word)
            const request = { scope: "system" as const, path }

            try {

                if (writing) {

                    if (!clientBody(args[1])) throw new Error("Writing takes bytes")
                    await authManager.linkManager.application.storageWrite(request, args[1], authManager.authorization, controller.signal)
                    control.close()
                    return []
                }

                const body = controlled(
                    await authManager.linkManager.application.storageStream(request, authManager.authorization, controller.signal),
                    controller,
                    control
                )

                return new TransferredAnswer([body], [body])
            }
            catch (exception) {

                control.close()
                throw exception
            }
        }

        // One desktop can frame many Client layers, but its complete area is
        // one host fact. It is this desktop's answer rather than a machine
        // fact, and the gutter remains private desktop layout state.
        if (word === "desktopSurface") return [desktop()]

        // Uploads are one flat public collection. The all permission exposes
        // its native entry point as part of the complete System contract.
        if (word === "uploads") {

            await access.requireAll()

            const operation = args[0]

            if (operation === "path") return [await authManager.uploadsPath()]

            if (operation === "stat") {

                if (!isUploadFile(args[1])) throw new Error("Uploads stat takes one upload file")

                return [await authManager.linkManager.application.uploadStat(args[1])]
            }

            if (operation === "stream") {

                if (!isUploadFile(args[1])) throw new Error("Uploads stream takes one upload file")

                const { control, controller } = cancellation(args[2], "uploads stream")

                try {

                    const body = controlled(

                        await authManager.linkManager.application.uploadStream(args[1], controller.signal),

                        controller,

                        control
                    )

                    return new TransferredAnswer([body], [body])
                }

                catch (exception) {

                    control.close()

                    throw exception
                }
            }

            if (operation !== "write") throw new Error(`Uploads does not know the operation "${String(operation)}"`)
            if (!clientBody(args[1])) throw new Error("Uploads write takes bytes")

            const description = args[2] as Partial<UploadValue> | null

            if (!description || typeof description.type !== "string" || typeof description.extension !== "string" || !/^[a-z0-9]+$/.test(description.extension)) {

                throw new Error("Uploads write takes a value description")
            }

            const { control, controller } = cancellation(args[3], "uploads write")

            try {

                const upload = await authManager.linkManager.application.uploadWrite(

                    args[1],

                    { extension: description.extension, type: description.type },

                    authManager.authorization,

                    controller.signal
                )

                control.close()

                return [upload]
            }

            catch (exception) {

                control.close()

                throw exception
            }
        }

        // The proxy is the desktop's authorized door, not this Process's.
        // The pane provides only the target request and its body; the desktop's
        // authorization is supplied here and never becomes a transmitted value.
        if (word === "fetch") {

            const description = args[0] as ProxyRequest

            await access.requireNetwork(description.url)

            const { control, controller } = cancellation(args[2], "fetch")

            let response: ProxiedResponse

            try {

                response = await authManager.linkManager.application.proxy(

                    description,

                    args[1] as ClientBody | null,

                    authManager.authorization,

                    controller.signal
                )
            }

            catch (exception) {

                control.close()

                throw exception
            }

            const body = response.body ? controlled(response.body, controller, control) : null

            if (!body) control.close()

            return new TransferredAnswer([{ ...response, body }], body ? [body] : [])
        }

        // The browser owns the standard WebSocket object. This boundary grants
        // authority before the frame creates it; no transport proxy is needed.
        if (word === "websocket") {

            await access.requireNetwork(String(args[0]))

            return []
        }

        throw new Error(`The desktop does not know the word "${String(word)}"`)
    }
}

function desktopPreferencesUpdate(value: unknown): DesktopPreferencesUpdate {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Desktop preferences must be an object")

    const preferences = value as Record<string, unknown>
    const keys = Object.keys(preferences)

    if (keys.length === 0 || keys.some(key => key !== "theme" && key !== "animations")) throw new Error("Desktop preferences must update theme, animations, or both")

    if ("theme" in preferences && preferences.theme !== "light" && preferences.theme !== "dark" && preferences.theme !== "default") {
        throw new Error("The Desktop theme preference must be light, dark, or default")
    }

    if ("animations" in preferences && typeof preferences.animations !== "boolean" && preferences.animations !== "default") {
        throw new Error("The Desktop animations preference must be true, false, or default")
    }

    return Object.freeze({ ...preferences }) as DesktopPreferencesUpdate
}

function isTrafficKind(value: unknown): value is TrafficKind {

    return value === "publish" || value === "ask" || value === "answer"
}

interface HandleAddress {

    identity: string

    reference: string
}

function address(process: { identity: string, reference: string }): HandleAddress {

    return { identity: process.identity, reference: process.reference }
}

function isHandleAddress(value: unknown): value is HandleAddress {

    return typeof value === "object" && value !== null && "identity" in value && "reference" in value
        && typeof value.identity === "string" && typeof value.reference === "string"
}

function clientBody(value: unknown): value is ClientBody {

    return value instanceof Blob || value instanceof ReadableStream
}

function cancellation(value: unknown, operation: string) {

    if (!(value instanceof MessagePort)) throw new Error(`${operation} needs a cancellation channel`)

    const controller = new AbortController()

    value.addEventListener("message", () => controller.abort(), { once: true })

    value.start()

    return { control: value, controller }
}

function controlled(body: ReadableStream<Uint8Array>, controller: AbortController, control: MessagePort) {

    const reader = body.getReader()

    function close() {

        control.close()
    }

    return new ReadableStream<Uint8Array>({

        async pull(stream) {

            try {

                const next = await reader.read()

                if (next.done) {

                    close()

                    stream.close()
                }

                else stream.enqueue(next.value)
            }

            catch (exception) {

                close()

                stream.error(exception)
            }
        },

        async cancel(reason) {

            controller.abort(reason)

            close()

            await reader.cancel(reason)
        }
    })
}
