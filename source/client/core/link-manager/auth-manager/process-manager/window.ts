import type { WindowSnapshot, Position, Size } from "@server/core/link-manager/auth-manager/process-manager/window"
import type { WindowGeometry, WindowLayer, WindowState } from "@phreshos/core"
import ProcessManager from "./process-manager"

/** Desktop projection of the authoritative Window for the current Client run. */
export default class Window {
    private state: WindowSnapshot | null = null

    public constructor(
        public readonly processManager: ProcessManager,
        public readonly process: string,
        payload: WindowSnapshot | null
    ) {
        if (payload) this.start(payload)
    }

    public start(payload: WindowSnapshot) { this.state = { ...payload } }
    public stop() { this.state = null }
    public follow(payload: WindowSnapshot) { this.start(payload) }

    public get live() { return this.state !== null }
    public get position() { return this.current.position }
    public get size() { return this.current.size }
    public get depth() { return this.current.depth }
    public get minimized() { return this.current.minimized }
    public get maximized() { return this.current.maximized }
    public get title() { return this.current.title }
    public get header() { return this.current.header }
    public get layer(): WindowLayer { return this.current.layer }

    private get current() {
        if (!this.state) throw new Error("This Client Endpoint is not running")
        return this.state
    }

    public stateSnapshot(): Omit<WindowState, "front"> & { depth: number } { return { ...this.current } }

    public async move(position: Position) { await this.processManager.$outbound.publish("/move", this.process, position) }
    public async resize(size: Size) { await this.processManager.$outbound.publish("/resize", this.process, size) }
    public async setGeometry(geometry: WindowGeometry) { await this.processManager.$outbound.publish("/set-geometry", this.process, geometry) }
    public async setTitle(title: string) { await this.processManager.$outbound.publish("/set-title", this.process, title) }
    public async setHeader(header: boolean) { await this.processManager.$outbound.publish("/set-header", this.process, header) }
    public async raise() { await this.processManager.$outbound.publish("/raise", this.process) }
    public async maximize(maximized: boolean) { await this.processManager.$outbound.publish("/maximize", this.process, maximized) }
    public async minimize(minimized: boolean) { await this.processManager.$outbound.publish("/minimize", this.process, minimized) }
}

export type { Position, Size }
