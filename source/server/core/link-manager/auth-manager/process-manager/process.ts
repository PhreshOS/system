import { Options } from "../program-manager/program-manager"
import Program from "../program-manager/program"
import Window, { Position, Size } from "./window"
import { Transmitted } from "@libs/messagepack"
import ServerProcessBoundary from "./server-process-boundary"
import HostTraffic from "./host-traffic"
import ClientState from "./client-state"
import { randomUUID } from "node:crypto"
import { type Layer, type PermissionName } from "@phreshos/core"
import Tunnel from "@libs/the-link/tunnel"
import type { ServerRuntime } from "./server-runtime"

/**
 * One live execution of a Program.
 *
 * Its immutable options are the launch state carried by this particular
 * life. They are available to either half without becoming part of the
 * Program declaration that later launches inherit.
 *
 * Endpoint presence is mutable live state. Each start creates a fresh
 * boundary incarnation; each stop removes that boundary and everything it
 * owns. The Process remains the stable aggregate around those incarnations
 * and must always have at least one live endpoint.
 *
 * The Server runtime boundary lives here beside the transmitted values and is
 * left out of toJSON: what crosses is declared, so a host-only execution
 * mechanism needs no second structure to hide in.
 */
export default class Process {

    /** Opaque identity of this one Process entity, never a public address. */
    public readonly reference = randomUUID()

    public readonly identity: string

    // A meaningful address within this program. Null means this process
    // has no role beyond its random identity.
    public readonly name: string | null

    // The program it is an instance of, held rather than named: a
    // process is derived from a program, and a name is only what that
    // program calls itself.
    public readonly program: Program

    // What its launch said. Attached the moment it started and carried
    // wherever it goes — a process is exactly one launch, so this is
    // the process's own state rather than a message it was sent.
    public readonly options: Options

    /** Immutable normalized intent used only to converge named creation. */
    public readonly launch: ProcessLaunch

    /** Permission grants that live exactly as long as this Process. */
    public readonly permissions = new Set<PermissionName>()

    // When this instance began. A process's birth is its construction,
    // so nothing hands this over — there is no earlier moment to mean.
    //
    // A `Date`, and the link keeps it one: MessagePack carries dates, and
    // `libs/messagepack` leaves them alone rather than letting `toJSON`
    // degrade them to strings. The other two roads out of here speak
    // plain JSON — a program's channel and this machine's door — so on
    // those it arrives as the ISO string a date serialises to. That is
    // harmless while nothing reads it there, and would stop being
    // harmless the moment a kit declared it a `Date`.
    public readonly startedAt = new Date()

    // The current server incarnation. Null is current live state, not a
    // declaration or a permanent launch-shape decision.
    public server: ServerProcessBoundary | null = null

    // The current client incarnation and the Window it owns. Its nearby iframe
    // boundary belongs to the desktop session, but both existence and Window
    // lifetime originate here. Stopping the client destroys this value whole.
    public client: ClientState | null = null

    // The process whose call to `program.process.create()` created this
    // one. Lineage only: keeping this handle neither owns nor prolongs
    // either life.
    public readonly parent: Process | null

    private readonly hostTraffic: HostTraffic

    private readonly serverStarts: ((server: ServerProcessBoundary) => void)[] = []

    private readonly serverStops: ((code: number | null, signal: NodeJS.Signals | null) => void)[] = []

    private readonly clientStops: (() => void)[] = []

    private readonly readyWaiters = new Set<() => void>()

    private readonly endings: Ending[] = []

    private ending: { code: number | null, signal: NodeJS.Signals | null } | null = null

    private exitProcess: (() => Promise<unknown>) | null = null

    public constructor(identity: string, name: string | null, program: Program, options: Options, launch: ProcessLaunch, parent: Process | null, hostTraffic: HostTraffic) {

        this.identity = identity

        this.name = name

        this.program = program

        this.options = options

        this.launch = launch

        this.parent = parent

        this.hostTraffic = hostTraffic
    }

    public startServer(runtime: ServerRuntime, ended: (boundary: ServerProcessBoundary, code: number | null, signal: NodeJS.Signals | null) => Promise<void> | void, unanswered: (values: unknown[], reason: string) => void, appearance: Tunnel) {

        if (this.server) return this.server

        let boundary!: ServerProcessBoundary

        boundary = new ServerProcessBoundary(runtime, this.program.client !== null, (code, signal) => ended(boundary, code, signal), unanswered, this.hostTraffic, appearance)

        this.server = boundary

        for (const listener of this.serverStarts) listener(boundary)

        return boundary
    }

    public serverStopped(boundary: ServerProcessBoundary, code: number | null, signal: NodeJS.Signals | null) {

        if (this.server !== boundary) return false

        this.server = null

        for (const listener of this.serverStops) listener(code, signal)

        return true
    }

    public serverBecameReady(boundary: ServerProcessBoundary) {

        if (this.server !== boundary || !boundary.ready) return

        const waiters = [...this.readyWaiters]

        this.readyWaiters.clear()

        for (const waiter of waiters) waiter()
    }

    public waitReady(notify: () => void) {

        if (this.server?.ready) {

            notify()

            return () => undefined
        }

        this.readyWaiters.add(notify)

        return () => { this.readyWaiters.delete(notify) }
    }

    public startClient(window: Window) {

        if (this.client) return false

        this.client = new ClientState(window)

        return true
    }

    public stopClient() {

        if (!this.client) return false

        this.client = null

        for (const listener of this.clientStops) listener()

        return true
    }

    public get live() {

        return this.server !== null || this.client !== null
    }

    public onServerStart(listener: (server: ServerProcessBoundary) => void) {

        this.serverStarts.push(listener)

        if (this.server) listener(this.server)
    }

    /** Internal aggregate exit used by lifecycle owners and focused probes. */
    public async exit() {

        if (!this.exitProcess) throw new Error("This Process has no lifecycle owner")

        await this.exitProcess()
    }

    public ownExit(exit: () => Promise<unknown>) {

        this.exitProcess = exit
    }

    public onServerStop(listener: (code: number | null, signal: NodeJS.Signals | null) => void) {

        this.serverStops.push(listener)

        return () => removeListener(this.serverStops, listener)
    }

    public onClientStop(listener: () => void) {

        this.clientStops.push(listener)

        return () => removeListener(this.clientStops, listener)
    }

    // Every aggregate ending, one word. Endpoint stops are separate lifecycle
    // transitions and reach this only when the complete Process is gone.
    //
    // The code and signal come with it, because whoever launched a
    // process may have to exit with its status. A listener that took
    // nothing dropped both.
    public onExit(listener: Ending) {

        if (this.ending) {

            listener(this.ending.code, this.ending.signal)

            return () => undefined
        }

        this.endings.push(listener)

        return () => {

            const index = this.endings.indexOf(listener)

            if (index !== -1) this.endings.splice(index, 1)
        }
    }

    // Said once, however many ways it could be said: a Server runtime's exit
    // removes the record, and removing the record is itself an ending.
    // The result remains terminal state rather than becoming lost history:
    // process creation announces externally before every internal owner has
    // finished attaching, and a fast runtime can exit during that announcement.
    public ended(code: number | null, signal: NodeJS.Signals | null) {

        if (this.ending) return

        this.ending = { code, signal }

        this.readyWaiters.clear()

        const endings = this.endings.splice(0)

        for (const listener of endings) listener(code, signal)
    }

    // The process value every road carries. Parentage is deliberately
    // absent: it is asked through `current.parent()`, so a client gate
    // can hide a cross-program parent without first exposing it here.
    public record() {

        return {

            reference: this.reference,

            identity: this.identity,

            name: this.name,

            program: this.program.identity,

            options: this.options,

            startedAt: this.startedAt,

            // These are live endpoint snapshots. Program declarations answer
            // which endpoint kinds can be started.
            server: this.server ? {} : null,

            client: this.client ? {} : null
        }
    }

    public hosted() {

        return {

            ...this.record(),

            // The trusted desktop counterpart keeps this essential fact
            // current. Framed program records are shaped separately.
            server: this.server ? { ready: this.server.ready } : null,

            // The trusted desktop needs the relationship in order to
            // answer a pane locally after the parent has exited. The
            // pane never receives this record whole.
            parent: this.parent?.record() ?? null,

            assetId: this.program.assetId,

            client: this.client
        }
    }

    public toJSON() {

        return this.record()
    }
}

function removeListener<Listener>(listeners: Listener[], listener: Listener) {

    const index = listeners.indexOf(listener)

    if (index >= 0) listeners.splice(index, 1)
}

export type HostedProcess = ReturnType<Process["hosted"]>

/** Public Process data from which an endpoint SDK reconstructs a handle. */
export type ProcessRecord = ReturnType<Process["record"]>

export type TransmittedProcess = Transmitted<HostedProcess>

export type Ending = (code: number | null, signal: NodeJS.Signals | null) => void

export type { Position, Size }

export type { Stream } from "./server-process-boundary"

/** Stable launch meaning, excluding mutable endpoint and Window state. */
export interface ProcessLaunch {

    readonly server: boolean

    readonly client: Readonly<{

        title: string

        position: Position | null

        size: Size | null

        layer: Layer

        location: string

        minimize: boolean
    }> | null

    readonly options: Readonly<Record<string, string>>
}
