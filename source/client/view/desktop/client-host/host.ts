import { type WindowLayer } from "@phreshos/core"
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

// The space windows are laid out in, as this desktop has it. Pixels,
// because a program asking has already decided that shares will not
// answer what it needs.
export interface Space {

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
 * Answers cross to a sandboxed frame by structured clone, which carries
 * no prototypes and refuses functions — so every word answers with plain
 * values built here, never with an instance the desktop holds.
 */
export default function host(authManager: AuthManager, pane: string, space: (layer: WindowLayer) => Space, frameOwner: () => string | null, pointer: PointerHost, localWindow: LocalWindowHost) {

    const { processManager, programManager } = authManager

    function process() {

        const found = processManager.processes.get(pane)

        if (!found) throw new Error("The desktop does not know this process")

        return found
    }

    // The gate.
    //
    // Program words resolve their subject from the frame and discard
    // what was asked, which is why their isolation needs nothing checked:
    // there is nothing to get wrong. Process-handle words take an
    // identity — a sibling this program is running — and that identity
    // is the first subject this side accepts from a pane.
    //
    // So it is measured, once, here: an identity a pane names must belong to
    // a process of the program that pane is a face of. A stranger's is
    // refused whether or not it exists, because whether it exists is
    // itself something a pane may not learn.
    function related(named: unknown) {

        if (!isHandleAddress(named)) return null

        const found = processManager.processes.get(named.identity)

        return found?.reference === named.reference && found.program === process().program ? found : null
    }

    function sibling(named: unknown) {

        const found = related(named)

        if (!found) throw new Error("The desktop does not know this process")

        return found
    }

    function window(named: unknown) {

        const found = sibling(named).client?.window

        if (!found) throw new Error("This process has no live client endpoint")

        return found
    }

    function mutableWindow(named: unknown) {

        const found = window(named)

        if (found.layer === "wallpaper") throw new Error("A wallpaper Window is managed by the system")

        return found
    }

    function declared(found: ReturnType<typeof process>, half: "server" | "client") {

        return (programManager.programs.get(found.program)?.[half] ?? null) !== null
    }

    function owner(found: ReturnType<typeof process> | NonNullable<ReturnType<typeof process>["parent"]>) {

        const program = programManager.programs.get(found.program)

        if (!program) throw new Error("The desktop does not know this program")

        return program
    }

    // One process record on every road. Nullable values carry the resolved
    // shape as data; the SDK turns them into permanent addressed ends whose
    // exists() reads the latest fact. A frame receives structured data,
    // never the desktop's mutable record.
    function record(found: ReturnType<typeof process> | NonNullable<ReturnType<typeof process>["parent"]>) {

        return sdkProcess(found, owner(found))
    }

    // Which window is topmost *of its own layer*, worked out the way the
    // desktop draws it: the shown one in that layer with the greatest
    // depth. A pane is told whether that is itself and nothing more, so
    // it learns no other window exists.
    //
    // This read across every layer until the layers existed, and the day
    // they did it began answering `false` to a window a person was
    // typing in because something in `over` had a larger number. Three
    // places now work this out — here, the core, and the desktop — and
    // all three read depth within one layer.
    function front(layer: WindowLayer) {

        let best: string | null = null

        let depth = -Infinity

        for (const entry of processManager.processes.values()) {

            const window = entry.client?.window

            if (!window || window.layer === "wallpaper" || window.minimized || window.layer !== layer || window.depth <= depth) continue

            best = entry.identity

            depth = window.depth
        }

        return best
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

            const target = args[1] === undefined ? process() : sibling(args[1])

            if (args[0] === "server") return [target.server !== null]

            if (args[0] === "client") return [target.client !== null]

            throw new Error("A Process endpoint is server or client")
        }

        if (word === "start-endpoint") {

            const target = args[0] === undefined ? process() : sibling(args[0])

            if (args[1] !== "server" && args[1] !== "client") throw new Error("A Process endpoint is server or client")

            await processManager.startEndpoint(target.identity, args[1], args[2] as never)

            return [target.identity]
        }

        if (word === "stop-endpoint") {

            const target = args[0] === undefined ? process() : sibling(args[0])

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

            const target = args[0] === null ? process() : sibling(args[0])

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

            const target = args[0] === undefined ? process() : sibling(args[0])

            const address = target.parent

            if (!address) return [null]

            const parent = processManager.processes.get(address.identity)

            if (!parent || parent.reference !== address.reference) throw new Error("The parent Process no longer exists")

            return [parent.program === process().program ? record(parent) : null]
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

            const found = processManager.processes.get(args[0].identity)

            return [!found || found.reference !== args[0].reference || found.program !== process().program]
        }

        // Every instance of this pane's program, this one among them: a
        // program's two halves must not disagree about how many of it
        // are running. Nothing is named — the program is the frame's.
        if (word === "processes") {

            return [[...processManager.processes.values()].filter(entry => entry.program === process().program).map(record)]
        }

        // One process of this program by immutable identity or by its
        // living program-local name. An exact identity always wins.
        if (word === "program-process") {

            const wanted = String(args[1])

            const identified = processManager.processes.get(wanted)

            if (identified?.program === process().program) return [record(identified)]

            const named = [...processManager.processes.values()].find(entry => entry.program === process().program && entry.name === wanted)

            return [named ? record(named) : null]
        }

        // Another instance of this pane's own program. The identity comes
        // from the frame, so this word can start nothing else.
        // The whole record, not the identity alone: a record invented at the
        // kit's end knows only what the caller could already have
        // guessed, which is how the process a program starts was the one
        // process that did not know when it started.
        if (word === "create-process") {

            const started = await programManager.createProcess(process().program, args[1] as Launch, process().identity)

            const startedRecord = processManager.processes.get(started)

            if (!startedRecord) throw new Error("The desktop does not know this process")

            return [record(startedRecord)]
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

            const target = args[1] === null ? process() : related(args[1])

            // Callback subscriptions are synchronous and remain silent when
            // their source is unavailable. waitFor() and events() identify
            // themselves as fallible, giving their boundary a real rejection
            // path when this synchronized Process record proves impossibility.
            if (!owner || !target) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

                return []
            }

            if (!declared(target, half)) {

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

            const target = args[1] === null ? process() : related(args[1])

            if (!frame || !target) {

                if (reportImpossible) throw new Error("The desktop does not know this process")

                return []
            }

            if (!declared(target, half)) {

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

            await processManager.publish(pane, sibling(args[0]).identity, args[1], args.slice(2))

            return []
        }

        // Forwarded, and that is all. The pane wrote its own address
        // into the question and holds its own deadline; this side has
        // nothing to wait for and nothing to answer with.
        if (word === "ask") {

            if (args[1] !== "server") throw new Error("Only a server end can be asked — a client end has no one answerer")

            await processManager.askOf(pane, sibling(args[0]).identity, args.slice(2))

            return []
        }

        // What a launch said. An explicit subject is a held sibling; the
        // empty subject used by `current.option()` is this frame's Process.
        // The latter is resolved here rather than named by program code,
        // exactly like every other `current` operation on this side.
        if (word === "option") {

            const found = args[0] === undefined ? process() : sibling(args[0])

            return [found.options[String(args[1])]]
        }

        // What this pane's program says it is. Never a path: a client
        // half has no disk, and where the machine put things is not a
        // program's own word about itself.

        if (word === "program") {

            const program = programManager.programs.get(process().program)

            if (!program) throw new Error("The desktop does not know this program")

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

            const program = programManager.programs.get(process().program)

            return [program?.installed === true]
        }

        if (word === "uninstall") {

            const program = programManager.programs.get(process().program)

            if (!program) throw new Error("The desktop does not know this program")

            return [await program.uninstall(args[1] === true, pane)]
        }

        if (word === "forget") {

            const program = programManager.programs.get(process().program)

            if (!program) throw new Error("The desktop does not know this program")

            return [await program.forget(pane)]
        }

        // How this pane is shown. Not `depth`: that is how the desktop
        // works out which window is at the front of its layer, and a
        // value that can be read but never acted on is a mechanism
        // rather than an answer. It is told `front`, which is what depth
        // was being used to ask.
        if (word === "window") {

            const shown = window(args[0] ?? address(process()))

            return [{

                title: shown.title,

                position: shown.position,

                size: shown.size,

                minimized: shown.minimized,

                front: front(shown.layer) === pane,

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

            await mutableWindow(args[0]).move(args[1] as never)

            return [pane]
        }

        if (word === "resize") {

            await mutableWindow(args[0]).resize(args[1] as never)

            return [pane]
        }

        if (word === "setGeometry") {

            await mutableWindow(args[0]).setGeometry(args[1] as never)

            return [pane]
        }

        if (word === "localWindow") return [localWindow.state(pane)]

        if (word === "localWindowMove") {

            await localWindow.move(pane, localPosition(args[0]), visualTransaction(args[1]))

            return []
        }

        if (word === "localWindowResize") {

            await localWindow.resize(pane, localSize(args[0]), visualTransaction(args[1]))

            return []
        }

        if (word === "localWindowGeometry") {

            await localWindow.geometry(pane, localGeometry(args[0]), visualTransaction(args[1]))

            return []
        }

        if (word === "localWindowMinimize") {

            localWindow.minimize(pane, args[0] !== false)

            return []
        }

        if (word === "localWindowTitle") {

            localWindow.title(pane, String(args[0] ?? ""))

            return []
        }

        if (word === "localWindowRaise") {

            localWindow.raise(pane)

            return []
        }

        if (word === "localWindowSurfaceSet") {

            await localWindow.setSurface(pane, surfaceSettings(args[0] === undefined ? {} : args[0]), visualTransaction(args[1]))

            return []
        }

        if (word === "localWindowSurfaceRemove") {

            localWindow.removeSurface(pane)

            return []
        }

        if (word === "changeTitle") {

            await mutableWindow(args[0]).changeTitle(String(args[1] ?? ""))

            return [pane]
        }

        if (word === "raise") {

            await mutableWindow(args[0]).raise()

            return [pane]
        }

        if (word === "minimize") {

            await mutableWindow(args[0]).minimize(args[1] !== false)

            return [pane]
        }

        if (word === "exit") {

            await sibling(args[0]).stop()

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

        // How large this pane's own layer workspace is. The Window chooses
        // the layer structurally; client code cannot inspect another layer.
        // Ordinary windows use the desktop workspace, while bare layers use
        // the browser viewport.
        //
        // The desktop's own answer, never the machine's: the same
        // program may be shown in three sessions on three screens, so
        // there is no one size to give a server half — which is why this
        // word is only on this side and why the core does not hold it.
        //
        // The desktop gutter is private layout state. It never crosses into
        // a Program endpoint as part of the surface value.
        if (word === "surface") {

            const shown = process().client?.window

            if (!shown) throw new Error("This process has no live client endpoint")

            return [space(shown.layer)]
        }

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
