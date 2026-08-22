import { type Launch } from "@server/core/link-manager/auth-manager/program-manager/program-manager"
import { type ProxyRequest } from "@server/core/protocol/proxy"
import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import { type ClientBody, type ProxiedResponse, type ServedValue } from "@client/core/application"
import { type PointerHost } from "./pointer"
import { type TrafficKind } from "@server/core/link-manager/auth-manager/process-manager/process-traffic"
import { sdkProcess, sdkProgram } from "./sdk-records"
import { isPermissionName, isServiceKey, type ProgramIconSize } from "@phreshos/core"
import {
    localGeometry,
    localPosition,
    localSize,
    surfaceSettings,
    visualTransaction,
    type LocalWindowHost
} from "./local-window"

/** A host answer whose stream must be transferred rather than cloned. */
export class TransferredAnswer {

    public constructor(public readonly result: unknown[], public readonly transfer: Transferable[]) { }
}

/** The complete measured desktop area in CSS pixels. */
export interface DesktopSize {

    width: number

    height: number
}

/**
 * The desktop's vocabulary: what a client half may ask of the interface
 * that frames it.
 *
 * A client half has the capabilities a server half has, narrowed to a
 * world containing exactly one program — its own. Public services are the
 * deliberate exception: a complete service key may name another Program, but
 * it reveals no topology and resolves only through the authoritative service
 * registry. It is not a claim of network confinement — `fetch` deliberately
 * reaches arbitrary URLs, but carries neither a Program subject nor the
 * desktop's authorization.
 *
 * Program operations take no subject at all: the frame a message arrived
 * in decides which program is meant, and what was asked is discarded.
 * Operations on a Process handle name a sibling and all go through
 * `sibling`, the one place a process identity from a pane is measured.
 *
 * A server half is the other thing and deliberately so: it runs
 * arbitrary code already, so vocabulary costs it nothing.
 *
 * Answers cross to a sandboxed frame inside MessagePack envelopes. Native
 * browser capabilities travel only as explicit attachments, so every ordinary
 * word answers with data built here, never with an instance the desktop holds.
 */
export default function host(authManager: AuthManager, pane: string, desktop: () => DesktopSize, frameOwner: () => string | null, pointer: PointerHost, localWindow: LocalWindowHost) {

    const { processManager, programManager } = authManager

    const scope = processManager.scope(pane)

    function process() {

        return scope.current()
    }

    // One process record on every road. Nullable values carry the resolved
    // shape as data; the SDK turns them into permanent addressed ends whose
    // exists() reads the latest fact. A frame receives MessagePack data, never
    // the desktop's mutable record.
    function record(found: ReturnType<typeof process> | NonNullable<ReturnType<typeof process>["parent"]>) {

        return sdkProcess(found, scope.programOf(found))
    }

    return async function answer(word: unknown, ...args: unknown[]) {

        if (word === "permission-granted") {

            if (!isPermissionName(args[0])) throw new Error(`The system does not know the permission "${String(args[0])}"`)

            return [await authManager.permissionGranted(pane, args[0])]
        }

        // When it started is a fact about this process, which a pane may
        // already ask everything else about — it was missing on this side
        // only because it was added on the other.
        if (word === "process") return [record(process())]

        if (word === "theme") return [authManager.linkManager.theme.value]

        if (word === "exists") {

            const target = args[1] === undefined ? process() : scope.sibling(args[1])

            if (args[0] === "server") return [target.server !== null]

            if (args[0] === "client") return [target.client !== null]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "start-endpoint") {

            const target = args[0] === undefined ? process() : scope.sibling(args[0])

            if (args[1] !== "server" && args[1] !== "client") throw new Error("A Process endpoint is server or client")

            await processManager.startEndpoint(target.identity, args[1], args[2] as never)

            return [target.identity]
        }

        if (word === "stop-endpoint") {

            const target = args[0] === undefined ? process() : scope.sibling(args[0])

            if (args[1] !== "server" && args[1] !== "client") throw new Error("A Process endpoint is server or client")

            await processManager.stopEndpoint(target.identity, args[1])

            return [target.identity]
        }

        if (word === "stop-current") {

            await processManager.stopEndpoint(process().identity, "client")

            return []
        }

        if (word === "enable-service") {

            await processManager.enableService(pane, args[0])

            return []
        }

        if (word === "disable-service") {

            await processManager.disableService(pane)

            return []
        }

        if (word === "endpoint-service") {

            const target = args[0] === null ? process() : scope.sibling(args[0])

            if (args[1] !== "server" && args[1] !== "client") throw new Error("A service Endpoint must be server or client")

            return [await processManager.endpointService(pane, address(target), args[1])]
        }

        if (word === "service-disabled") {

            if (!isServiceKey(args[0])) throw new Error("A complete service key is required")

            return [await processManager.serviceDisabled(args[0])]
        }

        if (word === "service-docs") {

            if (!isServiceKey(args[0]) || args[0].endpoint !== "server") throw new Error("A Server service key is required")

            return [await processManager.serviceDocs(args[0])]
        }

        if (word === "service-follow") {

            const [subscription, key, scope, event] = args

            if (typeof subscription !== "string" || !isServiceKey(key)) return []

            if (scope !== "lifecycle" && scope !== "channel") return []

            if (event !== null && typeof event !== "string") return []

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

            if (!isServiceKey(args[0]) || args[0].endpoint !== "server" || typeof args[1] !== "string") return []

            await processManager.sendService(pane, args[0], args[1], args[2])

            return []
        }

        if (word === "service-ask") {

            if (!isServiceKey(args[0]) || args[0].endpoint !== "server") throw new Error("Only a Server service can be asked")

            await processManager.askService(pane, args[0], args.slice(1))

            return []
        }

        // A pane may receive a parent only inside the one program it is
        // already a face of. No parent and a cross-program parent are
        // the same `null`, so the relationship cannot reveal a stranger.
        if (word === "parent") {

            const target = args[0] === undefined ? process() : scope.sibling(args[0])

            const parent = scope.parent(target)

            return [parent ? record(parent) : null]
        }

        // Whether a process a pane holds has ended.
        //
        // The one word here that answers about a process the desktop
        // does not know, because that absence is its subject — and the
        // one that does not go through `sibling`, because refusing would
        // answer the question it exists for. It stays inside the same
        // boundary by giving a stranger the same answer as a ghost: a
        // pane may not learn that another program's process exists, so
        // as far as one is concerned, it does not.
        if (word === "exited") {

            if (!isHandleAddress(args[0])) throw new Error("The boundary returned an invalid Process handle")

            return [scope.exited(args[0])]
        }

        // Every instance of this pane's program, this one among them: a
        // program's two halves must not disagree about how many of it
        // are running. Nothing is named — the program is the frame's.
        if (word === "processes") {

            return [scope.processes().map(record)]
        }

        // One process of this program by immutable identity or by its
        // living program-local name. An exact identity always wins.
        if (word === "program-process") {

            const wanted = String(args[1])

            const found = scope.findProcess(wanted)

            return [found ? record(found) : null]
        }

        // Another instance of this pane's own program. The identity comes
        // from the frame, so this word can start nothing else.
        // The whole record, not the identity alone: a record invented at the
        // kit's end knows only what the caller could already have
        // guessed, which is how the process a program starts was the one
        // process that did not know when it started.
        if (word === "create-process") {

            const started = await programManager.createProcess(process().program, args[1] as Launch, process().identity)

            return [record(scope.requireProcess(started))]
        }

        // Every instance ended, the asker last. One implementation on the
        // core serves this and a server half both.
        if (word === "exit-all") return [await processManager.exitAll(process().program, pane)]

        if (word === "observe") {

            const half = args[2]

            const kind = args[3]

            const reportImpossible = args[5] === true

            if (half !== "server" && half !== "client") throw new Error(`A process has no "${String(half)}" end`)

            if (!isTrafficKind(kind)) throw new Error(`The host does not know the traffic kind "${String(kind)}"`)

            const owner = frameOwner()

            const target = args[1] === null ? process() : scope.related(args[1])

            // Callback subscriptions are synchronous and remain silent when
            // their source is unavailable. waitFor() and events() identify
            // themselves as fallible, giving their boundary a real rejection
            // path when this synchronized Process record proves impossibility.
            if (!owner || !target) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

                return []
            }

            if (!scope.declared(target, half)) {

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

            const target = args[1] === null ? process() : scope.related(args[1])

            if (!frame || !target) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

                return []
            }

            if (!scope.declared(target, half)) {

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

        // Destinationless emission. The source comes from the frame boundary,
        // so Program code cannot speak as a sibling or another Program.
        if (word === "emit") {

            if (typeof args[0] !== "string") return []

            await processManager.emit(pane, args[0], args[1])

            return []
        }

        // Into one end of a sibling's channel, and asking its server end.
        // `sibling` is what makes the name safe; everything after it is
        // the same act a server half performs.
        if (word === "send") {

            if (args[1] !== "server" && args[1] !== "client") throw new Error(`A process has no "${String(args[1])}" end`)

            await processManager.publish(pane, scope.sibling(args[0]).identity, args[1], args.slice(2))

            return []
        }

        // Forwarded, and that is all. The pane wrote its own address
        // into the question and holds its own deadline; this side has
        // nothing to wait for and nothing to answer with.
        if (word === "ask") {

            if (args[1] !== "server") throw new Error("Only a server end can be asked — a client end has no one answerer")

            await processManager.askOf(pane, scope.sibling(args[0]).identity, args.slice(2))

            return []
        }

        // What a launch said. An explicit subject is a held sibling; the
        // empty subject used by `current.option()` is this frame's Process.
        // The latter is resolved here rather than named by program code,
        // exactly like every other `current` operation on this side.
        if (word === "option") {

            const found = args[0] === undefined ? process() : scope.sibling(args[0])

            return [found.options[String(args[1])]]
        }

        // What this pane's program says it is. Never a path: a client
        // half has no disk, and where the machine put things is not a
        // program's own word about itself.

        if (word === "program") {

            const program = scope.program()

            // What it declared about its window comes too — the same
            // kind of fact as its name, and what a window needs to know
            // how large another instance of itself would open.
            return [sdkProgram(program)]
        }

        // Icon bytes are requested only when this frame asks. The frame cannot
        // provide an identity; its owning Process determines the Program.
        if (word === "icon") return [await programManager.icon(process().program, args[0] as ProgramIconSize)]

        // Whether this pane's Program is installed, and the operations
        // that remove or forget it. Every subject is derived from the
        // frame; no identity supplied by the pane crosses this gate.
        //
        // **No `fork` or `install`.** Both lay out a Program and belong to
        // the server side; neither is a capability of a client face.
        if (word === "installed") {

            return [scope.program().installed === true]
        }

        if (word === "uninstall") {

            const program = scope.program()

            return [await program.uninstall(args[1] === true, pane)]
        }

        if (word === "forget") {

            const program = scope.program()

            return [await program.forget(pane)]
        }

        // How this pane is shown. Not `depth`: that is how the desktop
        // works out which window is at the front of its layer, and a
        // value that can be read but never acted on is a mechanism
        // rather than an answer. It is told `front`, which is what depth
        // was being used to ask.
        if (word === "window") {

            const shown = scope.window(args[0] ?? address(process()))

            return [{

                title: shown.title,

                position: shown.position,

                size: shown.size,

                minimized: shown.minimized,

                front: scope.front(shown.layer) === pane,

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

            await scope.mutableWindow(args[0]).move(args[1] as never)

            return [pane]
        }

        if (word === "resize") {

            await scope.mutableWindow(args[0]).resize(args[1] as never)

            return [pane]
        }

        if (word === "setGeometry") {

            await scope.mutableWindow(args[0]).setGeometry(args[1] as never)

            return [pane]
        }

        if (word === "windowLocal") return [localWindow.state(scope.localProcess(args[0]).identity)]

        if (word === "windowLocalMove") {

            await localWindow.move(scope.localProcess(args[0]).identity, localPosition(args[1]), visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalResize") {

            await localWindow.resize(scope.localProcess(args[0]).identity, localSize(args[1]), visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalGeometry") {

            await localWindow.geometry(scope.localProcess(args[0]).identity, localGeometry(args[1]), visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalMinimize") {

            localWindow.minimize(scope.localProcess(args[0]).identity, args[1] !== false)

            return []
        }

        if (word === "windowLocalTitle") {

            localWindow.title(scope.localProcess(args[0]).identity, String(args[1] ?? ""))

            return []
        }

        if (word === "windowLocalRaise") {

            localWindow.raise(scope.localProcess(args[0]).identity)

            return []
        }

        if (word === "windowLocalSurfaceSet") {

            await localWindow.setSurface(scope.localProcess(args[0]).identity, surfaceSettings(args[1] === undefined ? {} : args[1]), visualTransaction(args[2]))

            return []
        }

        if (word === "windowLocalSurfaceRemove") {

            localWindow.removeSurface(scope.localProcess(args[0]).identity)

            return []
        }

        if (word === "changeTitle") {

            await scope.mutableWindow(args[0]).changeTitle(String(args[1] ?? ""))

            return [pane]
        }

        if (word === "raise") {

            await scope.mutableWindow(args[0]).raise()

            return [pane]
        }

        if (word === "minimize") {

            await scope.mutableWindow(args[0]).minimize(args[1] !== false)

            return [pane]
        }

        if (word === "exit") {

            await scope.sibling(args[0]).exit()

            return [pane]
        }

        // This program's own store. The question names whose, as it does
        // on the other side, and the answer ignores it: whose is resolved
        // from the frame, never from what was asked. The application store
        // has no generic host road at all.
        if (word === "store") {

            const [, operation, key, value, ttl] = args as [unknown, string, string, unknown, number | undefined]

            return [await programManager.store(process().program, operation, key, value, ttl)]
        }

        // This program's places. Metadata operations remain ordinary values;
        // file content takes the storage door so its bytes never enter The
        // Link's serialization. The pane names neither a Program nor an
        // authorization: this frame resolves to a Process, and that Process
        // resolves to the Program whose area is opened.
        if (word === "data" || word === "cache") {

            const area: "data" | "cache" = word === "data" ? "data" : "cache"

            const operation = String(args[1])

            if (operation === "path" || operation === "resolve") throw new Error(`A client half is not told where its ${word} is`)

            if (operation === "stream" || operation === "write") {

                const joins = args[2]

                if (!Array.isArray(joins) || joins.some(join => typeof join !== "string")) throw new Error("A storage path is a list of names")

                const { control, controller } = cancellation(args[4], operation)

                const request = { program: process().program, area, path: joins }

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

            return [await programManager.area(process().program, word, operation, args.slice(2))]
        }

        // What this program has said. Whose, as everywhere here, is the
        // frame's rather than the question's — so a window reads its own
        // program's output and has no way to name another's.
        //
        // Nothing refuses a query that would write, because the
        // connection behind it cannot: a pane's SQL reaches a read-only
        // database, which is the same thing a server half's reaches.
        if (word === "logs") {

            return [await programManager.logs(process().program, String(args[1]), Array.isArray(args[2]) ? args[2] : [])]
        }

        // This program's own database. Whose is the frame's, as
        // everywhere here, so a window reads and writes its own and has
        // no way to name another's.
        if (word === "database") {

            return [await programManager.database(process().program, String(args[1]), Array.isArray(args[2]) ? args[2] : [])]
        }

        // One desktop can frame many Client layers, but its complete area is
        // one host fact. It is this desktop's answer rather than a machine
        // fact, and the gutter remains private desktop layout state.
        if (word === "desktop") return [desktop()]

        // Coordinates use the same desktop display core as window geometry.
        // Before this session has observed a pointer movement there is no
        // position to invent, so the initial answer is null.
        if (word === "pointer") {

            if (await authManager.permissionGranted(pane, "pointer") !== true) throw new Error("Permission \"pointer\" is not granted")

            return [pointer.position()]
        }

        // A pane normalizes any writable value before it reaches the frame wall:
        // finite bytes retain their native Blob and an open stream is transferred.
        // The desktop sends either through its authorized uploads door and returns
        // only the served file's description.
        if (word === "serve") {

            if (!clientBody(args[0])) throw new Error("Serving takes bytes")

            const description = args[1] as Partial<ServedValue> | null

            if (!description || typeof description.type !== "string" || typeof description.extension !== "string" || !/^[a-z0-9]+$/.test(description.extension)) {

                throw new Error("Serving takes a value description")
            }

            const { control, controller } = cancellation(args[2], "serve")

            try {

                const served = await authManager.linkManager.application.serve(

                    args[0],

                    { extension: description.extension, type: description.type },

                    authManager.authorization,

                    controller.signal
                )

                control.close()

                return [served]
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

            const { control, controller } = cancellation(args[2], "fetch")

            let response: ProxiedResponse

            try {

                response = await authManager.linkManager.application.proxy(

                    args[0] as ProxyRequest,

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

        throw new Error(`The desktop does not know the word "${String(word)}"`)
    }
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
