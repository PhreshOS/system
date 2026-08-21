import { type WindowLayer } from "@phreshos/core"
import { type default as Process } from "./process"
import { type default as ProcessManager } from "./process-manager"

/**
 * The Core capability scope of one framed Client Process.
 *
 * View supplies only the pane that received a request. This scope resolves
 * every domain subject from that structural fact, so presentation never owns
 * cross-Program visibility or Window mutability policy.
 */
export default class ProcessScope {

    public constructor(public readonly processManager: ProcessManager, public readonly pane: string) { }

    public current() {

        const found = this.processManager.processes.get(this.pane)

        if (!found) throw new Error("The desktop does not know this process")

        return found
    }

    public related(named: unknown) {

        if (!isHandleAddress(named)) return null

        const found = this.processManager.processes.get(named.identity)

        return found?.reference === named.reference && found.program === this.current().program ? found : null
    }

    public sibling(named: unknown) {

        const found = this.related(named)

        if (!found) throw new Error("The desktop does not know this process")

        return found
    }

    public window(named: unknown) {

        const found = this.sibling(named).client?.window

        if (!found) throw new Error("This process has no live client endpoint")

        return found
    }

    public mutableWindow(named: unknown) {

        const found = this.window(named)

        if (found.layer === "wallpaper") throw new Error("A wallpaper Window is managed by the system")

        return found
    }

    public localProcess(named: unknown) {

        const found = this.sibling(named)

        if (!found.client) throw new Error("This process has no live client endpoint")

        if (found.client.window.layer === "wallpaper") throw new Error("A wallpaper Window is managed by the system")

        return found
    }

    public declared(found: Process, half: "server" | "client") {

        return (this.processManager.authManager.programManager.programs.get(found.program)?.[half] ?? null) !== null
    }

    public programOf(found: Pick<Process, "program">) {

        const program = this.processManager.authManager.programManager.programs.get(found.program)

        if (!program) throw new Error("The desktop does not know this program")

        return program
    }

    /** Resolve the current Process's live, same-Program parent. */
    public parent(found: Process) {

        const address = found.parent

        if (!address) return null

        const parent = this.processManager.processes.get(address.identity)

        if (!parent || parent.reference !== address.reference) throw new Error("The parent Process no longer exists")

        return parent.program === this.current().program ? parent : null
    }

    /** Whether a handle has ended or is outside this pane's Program scope. */
    public exited(address: HandleAddress) {

        const found = this.processManager.processes.get(address.identity)

        return !found || found.reference !== address.reference || found.program !== this.current().program
    }

    /** Every live Process belonging to this pane's Program. */
    public processes() {

        return [...this.processManager.processes.values()].filter(entry => entry.program === this.current().program)
    }

    /** Resolve one same-Program Process by identity first, then by local name. */
    public findProcess(wanted: string) {

        const program = this.current().program

        const identified = this.processManager.processes.get(wanted)

        if (identified?.program === program) return identified

        return [...this.processManager.processes.values()].find(entry => entry.program === program && entry.name === wanted) ?? null
    }

    /** Resolve a trusted Process identity returned by an application operation. */
    public requireProcess(identity: string) {

        const found = this.processManager.processes.get(identity)

        if (!found) throw new Error("The desktop does not know this process")

        return found
    }

    /** The Program that owns this pane. */
    public program() {

        return this.programOf(this.current())
    }

    public front(layer: WindowLayer) {

        return this.processManager.front(layer)
    }
}

function isHandleAddress(value: unknown): value is HandleAddress {

    return typeof value === "object" && value !== null && "identity" in value && "reference" in value
        && typeof value.identity === "string" && typeof value.reference === "string"
}

interface HandleAddress {

    identity: string

    reference: string
}
