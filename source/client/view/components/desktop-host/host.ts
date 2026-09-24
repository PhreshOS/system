import {
    type DesktopViewportSnapshot,
    type Launch,
    type WindowState
} from "@phreshos/core"
import { type ProxyRequest } from "@server/core/protocol/proxy"
import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { type ClientBody, type ProxiedResponse, type UploadValue } from "@client/core/application"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"
import { sdkProcess, sdkProgram } from "./sdk-records"
import { type default as ClientProgram } from "@client/core/link-manager/auth-manager/program-manager/program"
import { type default as ClientProcess } from "@client/core/link-manager/auth-manager/process-manager/process"
import {
    isServiceAddress,
    isUploadFile,
    parseDesktopPreferencesUpdate,
    parsePermission,
    parsePermissionName,
    parsePermissions,
    type PermissionRequest,
    type ProgramIconSize
} from "@phreshos/core"
import {
    presentationSurface,
    presentationGeometry,
    presentationMoveGestureStart,
    presentationPosition,
    presentationSize,
    presentationTransaction,
    type PresentationMoveCoordinates,
    type WindowPresentationHost
} from "./window-presentation"
import SystemAccess from "./system-access"
import { allowsSynchronizedPermission } from "@shared/permission-state"

/** A host answer whose stream must be transferred rather than cloned. */
export class TransferredAnswer {

    public constructor(public readonly result: unknown[], public readonly transfer: Transferable[]) { }
}

/** Adapts the complete System contract and contextual Desktop capabilities to one Client frame. */
export default function host(authManager: AuthManager, pane: string, viewport: () => DesktopViewportSnapshot, frameOwner: () => string | null, moveCoordinates: PresentationMoveCoordinates, presentation: WindowPresentationHost) {

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

        if (!isServiceAddress(value)) throw new Error("A complete Service address is required")

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

    function windowOf(found: ClientProcess) {

        if (!found.clientEndpoint) throw new Error("This Program declared no Client Endpoint")

        if (!found.client) throw new Error("This Client Endpoint is not running")

        return found.clientEndpoint.window
    }

    function presentationProcess(value: unknown) {

        const found = holdProcess(value)

        if (found !== process()) throw new Error("Window presentation operations belong to the current Client Context")

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

        if (word === "desktop-connection") {

            await access.require("desktopConnection", [])

            return [await authManager.connection("current")]
        }

        if (word === "host-program-list") {

            const programs = [...programManager.programs.values()].filter(program => args[0] !== true || program.installed)
            const visible = []

            for (const program of programs) if (await access.canProgram(program)) visible.push(program)

            return [visible.map(sdkProgram)]
        }

        if (typeof word === "string" && word.startsWith("host-authentication-")) {

            const operation = word.slice("host-authentication-".length) as "state" | "requirements" | "set-credentials" | "sign-out-all-sessions" | "connections" | "connection" | "sessions" | "session"

            if (operation === "state" || operation === "requirements" || operation === "set-credentials" || operation === "sign-out-all-sessions") {

                await access.require("authentication", [])

                return [await authManager.authentication(operation, args[0])]
            }

            if (operation === "connections") {

                const connections = await authManager.authentication("connections") as { identity: string }[]

                return [await access.connections(connections)]
            }

            if (operation === "sessions") {

                const sessions = await authManager.authentication("sessions") as { identity: string }[]

                return [await access.sessions(sessions)]
            }

            const identity = String(args[0])

            if (operation === "connection") {

                const connection = await authManager.authentication("connection", identity) as { identity: string } | null

                return [connection && await access.canConnection(connection.identity) ? connection : null]
            }

            const session = await authManager.authentication("session", identity) as { identity: string } | null

            return [session && await access.canSession(session.identity) ? session : null]
        }

        if (typeof word === "string" && word.startsWith("host-connection-")) {

            const operation = word.slice("host-connection-".length) as "state" | "session" | "sign-in"

            const identity = String(args[0])

            if (!await access.canConnection(identity)) throw new Error("Connection not found")

            return [await authManager.connection(operation, identity)]
        }

        if (typeof word === "string" && word.startsWith("host-session-")) {

            const operation = word.slice("host-session-".length) as "state" | "connections" | "sign-out"

            const identity = String(args[0])

            if (!await access.canSession(identity)) throw new Error("Session not found")

            if (operation === "connections") {

                const connections = await authManager.session(operation, identity) as { identity: string }[]

                return [await access.connections(connections)]
            }

            return [await authManager.session(operation, identity)]
        }

        if (word === "host-program-find") {

            const program = programManager.programs.get(String(args[0]))

            return [program && await access.canProgram(program) ? sdkProgram(program) : null]
        }

        if (word === "host-program-create" || word === "host-program-force-create") {

            await access.requireAll()

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

            return [found && await access.canProcess(found) ? record(found) : null]
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

            const preferences = parseDesktopPreferencesUpdate(args[0])

            await authManager.linkManager.requestDesktopPreferences(preferences)

            return []
        }

        if (word === "running") {

            const target = await permittedProcess(args[1])

            if (args[0] === "server") {

                const program = authManager.programManager.programs.get(target.program)

                if (!program?.server) throw new Error("This Program declared no Server Endpoint")

                return [target.server !== null]
            }

            if (args[0] === "client") {

                if (!target.clientEndpoint) throw new Error("This Program declared no Client Endpoint")

                return [target.client !== null]
            }

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "start-endpoint") {

            const target = await permittedProcess(args[0])

            if (args[1] !== "server" && args[1] !== "client") throw new Error("A Process endpoint is server or client")

            const launch = args[1] === "client" ? await access.clientLaunch(args[2]) : args[2]

            await processManager.startEndpoint(target.identity, args[1], launch as never)

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

            const program = authManager.programManager.programs.get(target.program)

            if (endpoint === "server" ? !program?.server : !target.clientEndpoint) {

                throw new Error(`This Program declared no ${endpoint === "server" ? "Server" : "Client"} Endpoint`)
            }

            return [await processManager.endpointIsService(pane, address(target), endpoint)]
        }

        if (word === "host-service-list" || word === "host-service-search") {

            const name = word === "host-service-search" ? args[0] : undefined

            if (name !== undefined && (typeof name !== "string" || !name.trim())) throw new Error("A Service name is required")

            const services = await processManager.listServices(name)
            const visible = []

            for (const service of services) if (await access.canService(service)) visible.push(service)

            return [visible]
        }

        if (word === "service-available") {

            const service = await permittedService(args[0])

            return [await processManager.serviceAvailable(service)]
        }

        if (word === "service-wait-ready") {

            const service = await permittedService(args[0])

            return [await processManager.waitServiceReady(service, args[1] as number | undefined)]
        }

        if (word === "service-program-metadata") {

            const service = await permittedService(args[0])

            return [await processManager.serviceProgramMetadata(service)]
        }

        if (word === "service-program-icon") {

            const service = await permittedService(args[0])

            return [await processManager.serviceProgramIcon(service, args[1] as ProgramIconSize | undefined)]
        }

        if (word === "service-follow") {

            const [subscription, address, scope, event] = args

            if (typeof subscription !== "string" || !isServiceAddress(address)) return []

            if (scope !== "lifecycle" && scope !== "events") return []

            if (event !== null && typeof event !== "string") return []

            if (!await access.canService(address)) return []

            const owner = frameOwner()

            if (owner) await processManager.followService(pane, owner, subscription, address, scope, event)

            return []
        }

        if (word === "service-unfollow") {

            const owner = frameOwner()

            if (owner) await processManager.unfollowService(pane, owner, String(args[0]))

            return []
        }

        if (word === "service-send") {

            if (!isServiceAddress(args[0]) || typeof args[1] !== "string") return []

            const service = await access.service(args[0])

            await processManager.sendService(pane, service, args[1], args[2])

            return []
        }

        if (word === "service-ask") {

            if (!isServiceAddress(args[0]) || args[0].endpoint !== "server") throw new Error("Only a Server service can be asked")

            const service = await access.service(args[0])

            await processManager.askService(pane, service, args.slice(1))

            return []
        }

        // Parentage is immutable lineage. Its retained record remains a valid
        // Process handle source after the parent leaves the live registry.
        if (word === "parent") {

            const target = await permittedProcess(args[0])

            if (!target.parent) return [null]

            return [await access.canProcess(target.parent) ? sdkProcess(target.parent, programOf(target.parent)) : null]
        }

        // A retained Process handle remains able to report its own ending.
        if (word === "exited") {

            if (!isHandleAddress(args[0])) throw new Error("The boundary returned an invalid Process handle")

            const current = resolveProcess(args[0])

            if (current) await access.process(current)

            return [current === null]
        }

        // Every live Process belonging to one exact Program handle.
        if (word === "program-processes") {

            const program = await permittedProgram(args[0])

            return [[...processManager.processes.values()].filter(entry => entry.program === program.identity).map(record)]
        }

        // One process of this program by immutable identity or by its
        // living program-local name. An exact identity always wins.
        if (word === "program-find-process") {

            const program = await permittedProgram(args[0])
            const wanted = String(args[1])
            const exact = processManager.processes.get(wanted)
            const found = exact?.program === program.identity
                ? exact
                : [...processManager.processes.values()].find(entry => entry.program === program.identity && entry.name === wanted)

            return [found ? record(found) : null]
        }

        // Create another Process from one exact Program handle.
        if (word === "program-create-process") {

            const program = await permittedProgram(args[0])
            const launch = await access.launch(args[1])
            const started = await programManager.createProcess(address(program), launch, process().identity)

            return [record(requireProcess(started))]
        }

        if (word === "program-find-or-create-process") {

            const program = await permittedProgram(args[0])
            const launch = await access.launch(args[1]) as Launch & { name: string }

            const found = await programManager.findOrCreateProcess(address(program), launch, process().identity)

            return [record(requireProcess(found))]
        }

        // Every instance ended, the asker last. One implementation on the
        // core serves this and a server half both.
        if (word === "program-exit-processes") return [await processManager.exitAll((await permittedProgram(args[0])).identity, pane)]

        if (word === "observe") {

            const half = args[2]

            const kind = args[3]

            const reportImpossible = args[5] === true

            if (half !== "server" && half !== "client") throw new Error(`A process has no "${String(half)}" end`)

            if (!isTrafficKind(kind)) throw new Error(`The host does not know the traffic kind "${String(kind)}"`)

            const owner = frameOwner()

            const target = args[1] === null ? process() : resolveProcess(args[1])

            // Callback subscriptions are synchronous and remain silent when
            // their source is unavailable. wait() and events() identify
            // themselves as fallible, giving their boundary a real rejection
            // path when this synchronized Process record proves impossibility.
            if (!owner || !target) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

                return []
            }

            if (!await access.canProcess(target)) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

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

                if (reportImpossible) throw new Error("The desktop does not know this process")

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

        // The Program belonging to the current Client Context.
        if (word === "current-program") {

            const program = programOf(process())

            // What it declared about its window comes too — the same
            // kind of fact as its name, and what a window needs to know
            // how large another instance of itself would open.
            return [sdkProgram(program)]
        }

        if (word === "program-permissions") {

            const program = await permittedProgram(args[0])

            const operation = args[1]

            if (operation !== "all" && operation !== "get" && operation !== "allows" && operation !== "allow" && operation !== "deny" && operation !== "request") throw new Error(`The System does not know the Program permission operation "${String(operation)}"`)

            if (operation === "all") return [parsePermissions(program.permissions)]

            if (operation === "request") {

                if (typeof args[2] !== "string") throw new Error("A permission request needs an identity")

                const permission = parsePermissionName(args[3])

                return [await authManager.requestPermission(
                    pane,
                    address(program),
                    args[2],
                    permission,
                    args[4] as PermissionRequest<typeof permission>
                )]
            }

            const permission = parsePermissionName(args[2])

            if (operation === "allows") {

                // Native Storage scopes require host path canonicalization;
                // every other permission is fully represented by the synced
                // Program snapshot already held by this trusted Desktop.
                if (permission === "storage") return [await programManager.permissions(
                    address(program),
                    operation,
                    permission,
                    args[3] as PermissionRequest<typeof permission>
                )]

                const requested = args[3] === undefined || args[3] === true
                    ? []
                    : parsePermission(permission, args[3])

                if (!Array.isArray(requested)) throw new Error("A permission check must be true or a list of values")

                return [allowsSynchronizedPermission(program.permissions, permission, requested)]
            }

            if (operation === "allow") {

                await access.requireAll()
                await programManager.permissions(
                    address(program),
                    operation,
                    permission,
                    args[3] as PermissionRequest<typeof permission>
                )

                return []
            }

            if (operation === "deny") {

                await access.requireAll()
                await programManager.permissions(address(program), operation, permission)

                return []
            }

            return [program.permissions[permission] ?? null]
        }

        if (word === "startup") {

            const program = await permittedProgram(args[0])

            const operation = String(args[1])
            const launch = operation === "enable" ? await access.launch(args[2]) : args[2]

            return [await programManager.startup(address(program), operation, launch)]
        }

        if (word === "pinned") {

            const operation = args[1]
            if (operation !== "get" && operation !== "pin" && operation !== "unpin") throw new Error(`The System does not know the pinned operation "${String(operation)}"`)
            return [await programManager.pinned(address(await permittedProgram(args[0])), operation)]
        }

        if (word === "program-agent") return [await programManager.agent(address(await permittedProgram(args[0])))]

        if (word === "program-definition") return [await programManager.definition(address(await permittedProgram(args[0])))]

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
            const shown = windowOf(target)

            return [{

                title: shown.title,

                header: shown.header,

                position: shown.position,

                size: shown.size,

                minimized: shown.minimized,
                maximized: shown.maximized,

                front: processManager.front(shown.layer) === target.identity,

                // Which structurally isolated Desktop layer contains it.
                layer: shown.layer
            } satisfies WindowState]
        }

        if (word === "move") {

            await windowOf(await permittedProcess(args[0])).move(args[1] as never)

            return [pane]
        }

        if (word === "resize") {

            await windowOf(await permittedProcess(args[0])).resize(args[1] as never)

            return [pane]
        }

        if (word === "setGeometry") {

            await windowOf(await permittedProcess(args[0])).setGeometry(args[1] as never)

            return [pane]
        }

        if (word === "windowPresentationLayer") {
            const target = presentationProcess(args[0])
            return [presentation.layer(target.identity)]
        }

        if (word === "windowPresentationMoveGestureBegin") {
            const target = presentationProcess(args[0])
            const gesture = gestureIdentity(args[1])
            const start = presentationMoveGestureStart(args[2])
            await presentation.beginMoveGesture(
                target.identity,
                gesture,
                moveCoordinates.point(start.origin),
                moveCoordinates.point(start.point)
            )
            return []
        }

        if (word === "windowPresentationMoveGestureWait") {
            const target = presentationProcess(args[0])
            const gesture = gestureIdentity(args[1])
            await presentation.waitMoveGesture(target.identity, gesture)
            return []
        }

        if (word === "windowPresentationMoveGestureCancel") {
            const target = presentationProcess(args[0])
            const gesture = gestureIdentity(args[1])
            presentation.cancelMoveGesture(target.identity, gesture)
            return []
        }

        const selectedTransaction = () => presentationTransaction(args[2])

        if (word === "windowPresentationMove") {

            const target = presentationProcess(args[0])
            await presentation.move(target.identity, presentationPosition(args[1]), selectedTransaction())

            return []
        }

        if (word === "windowPresentationResize") {

            const target = presentationProcess(args[0])
            await presentation.resize(target.identity, presentationSize(args[1]), selectedTransaction())

            return []
        }

        if (word === "windowPresentationGeometry") {

            const target = presentationProcess(args[0])
            await presentation.setGeometry(target.identity, presentationGeometry(args[1]), selectedTransaction())

            return []
        }

        if (word === "windowPresentationSurface") {
            const target = presentationProcess(args[0])
            await presentation.setSurface(target.identity, presentationSurface(args[1]), selectedTransaction())
            return []
        }

        if (word === "windowPresentationInteractive") {
            const target = presentationProcess(args[0])
            if (typeof args[1] !== "boolean") throw new Error("Window presentation interaction must be true or false")
            presentation.setInteractive(target.identity, args[1])
            return []
        }

        if (word === "windowPresentationRaise") {

            const target = presentationProcess(args[0])
            presentation.raise(target.identity)

            return []
        }

        if (word === "setTitle") {

            await windowOf(await permittedProcess(args[0])).setTitle(String(args[1] ?? ""))

            return [pane]
        }

        if (word === "setHeader") {

            if (typeof args[1] !== "boolean") throw new Error("Window header state must be true or false")

            await windowOf(await permittedProcess(args[0])).setHeader(args[1])

            return [pane]
        }

        if (word === "raise") {

            await windowOf(await permittedProcess(args[0])).raise()

            return [pane]
        }

        if (word === "maximize") {
            await windowOf(await permittedProcess(args[0])).maximize(args[1] !== false)
            return [pane]
        }

        if (word === "minimize") {

            await windowOf(await permittedProcess(args[0])).minimize(args[1] !== false)

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

            if (operation === "path" || operation === "name") {

                const path = await programManager.area(address(program), word, operation, args.slice(2))

                if (typeof path !== "string") throw new Error("The System returned invalid Storage text")

                if (operation === "path") await access.requireStorage(path)

                return [path]
            }

            if (operation === "stream" || operation === "write" || operation === "append") {

                const joins = args[2]

                if (!Array.isArray(joins) || joins.some(join => typeof join !== "string")) throw new Error("A storage path is a list of names")

                const { control, controller } = cancellation(args[4], operation)

                const request = { scope: "program" as const, program: address(program), area, path: joins }

                try {

                    if (operation === "write" || operation === "append") {

                        if (!clientBody(args[3])) throw new Error("Writing takes bytes")

                        if (operation === "append") await authManager.linkManager.application.storageAppend(request, args[3], authManager.sessionToken, controller.signal)

                        else await authManager.linkManager.application.storageWrite(

                            request,

                            args[3],

                            authManager.sessionToken,

                            controller.signal,

                            storageWriteOptions(args[5]).overwrite
                        )

                        control.close()

                        return []
                    }

                    const body = controlled(

                        await authManager.linkManager.application.storageStream(

                            request,

                            authManager.sessionToken,

                            controller.signal,

                            storageReadOptions(args[5])
                        ),

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

            const operation = String(args[0])
            const paths = args[1]

            if (!Array.isArray(paths) || paths.some(path => typeof path !== "string")) throw new Error("A Storage path is a list of names")

            const path = await authManager.storage("path", paths)

            if (typeof path !== "string") throw new Error("The System returned an invalid Storage path")

            if (operation === "path" || operation === "name") {

                await access.requireStorage(path)

                return [await authManager.storage(operation, paths, args[2])]
            }

            const required = operation === "delete-storage" || operation === "delete-file" || operation === "clear"
                ? "delete"
                : operation === "create"
                    ? "write"
                    : "read"

            await access.requireStorage(path, required)

            return [await authManager.storage(operation, paths, args[2])]
        }

        if (word === "host-storage-stream" || word === "host-storage-write" || word === "host-storage-append") {

            const path = args[0]

            if (!Array.isArray(path) || path.some(part => typeof part !== "string")) throw new Error("A storage path is a list of names")

            const writing = word !== "host-storage-stream"
            const resolved = await authManager.storage("path", path)

            if (typeof resolved !== "string") throw new Error("The System returned an invalid Storage path")

            await access.requireStorage(resolved, writing ? "write" : "read")
            const { control, controller } = cancellation(args[2], word)
            const request = { scope: "system" as const, path }

            try {

                if (writing) {

                    if (!clientBody(args[1])) throw new Error("Writing takes bytes")
                    if (word === "host-storage-append") await authManager.linkManager.application.storageAppend(request, args[1], authManager.sessionToken, controller.signal)

                    else await authManager.linkManager.application.storageWrite(

                        request,

                        args[1],

                        authManager.sessionToken,

                        controller.signal,

                        storageWriteOptions(args[3]).overwrite
                    )
                    control.close()
                    return []
                }

                const body = controlled(
                    await authManager.linkManager.application.storageStream(

                        request,

                        authManager.sessionToken,

                        controller.signal,

                        storageReadOptions(args[3])
                    ),
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
        if (word === "desktopViewport") return [viewport()]

        // Completed uploads are public values. Creating one has its own
        // permission; exposing the native directory requires complete access.
        if (word === "uploads") {

            const operation = args[0]

            if (operation === "path") {

                const path = await authManager.uploadsPath()

                await access.requireStorage(path)

                return [path]
            }

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

            await access.require("uploads", [])

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

                    authManager.sessionToken,

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

                    authManager.sessionToken,

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

function gestureIdentity(value: unknown) {
    if (typeof value !== "string" || value.length === 0) throw new Error("A Window move gesture identity is required")
    return value
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

function storageReadOptions(value: unknown) {

    if (value === undefined) return {}

    if (!value || typeof value !== "object") throw new Error("Storage read options must be an object")

    const options = value as { offset?: unknown, length?: unknown }

    if (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || (options.offset as number) < 0)) throw new Error("A Storage read offset must be a non-negative safe integer")

    if (options.length !== undefined && (!Number.isSafeInteger(options.length) || (options.length as number) < 0)) throw new Error("A Storage read length must be a non-negative safe integer")

    if (typeof options.offset === "number" && typeof options.length === "number" && !Number.isSafeInteger(options.offset + options.length)) throw new Error("A Storage byte range must use safe integers")

    return { offset: options.offset as number | undefined, length: options.length as number | undefined }
}

function storageWriteOptions(value: unknown) {

    if (value === undefined) return { overwrite: true }

    if (!value || typeof value !== "object") throw new Error("Storage write options must be an object")

    const overwrite = (value as { overwrite?: unknown }).overwrite

    if (overwrite !== undefined && typeof overwrite !== "boolean") throw new Error("Storage overwrite must be boolean")

    return { overwrite: overwrite !== false }
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
