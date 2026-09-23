import {
    isRelativeValue,
    type Position,
    type Size,
    type Value,
    type WindowGeometry,
    type WindowLayer
} from "@phreshos/core"

/** Values from which one running Client Endpoint begins its authoritative Window. */
export interface Shown {
    title: string
    header: boolean
    layer: WindowLayer
}

/**
 * Stable Window handle whose authoritative state exists only while its Client
 * Endpoint is running. A restart replaces the complete state in one step.
 */
export default class Window {
    private state: WindowSnapshot | null = null

    public start(shown: Shown, position: Position, size: Size, depth: number, minimized: boolean, maximized = false) {
        validate(position.x, "x")
        validate(position.y, "y")
        validate(size.width, "width")
        validate(size.height, "height")

        this.state = {
            title: readableTitle(shown.title),
            header: boolean(shown.header, "Window header state"),
            layer: shown.layer,
            position,
            size,
            depth,
            minimized: boolean(minimized, "Window minimized state"),
            maximized: boolean(maximized, "Window maximized state")
        }
    }

    public stop() { this.state = null }

    public get live() { return this.state !== null }
    public get position() { return this.current.position }
    public set position(value) { this.current.position = value }
    public get size() { return this.current.size }
    public set size(value) { this.current.size = value }
    public get depth() { return this.current.depth }
    public set depth(value) { this.current.depth = value }
    public get minimized() { return this.current.minimized }
    public set minimized(value) { this.current.minimized = value }
    public get maximized() { return this.current.maximized }
    public set maximized(value) { this.current.maximized = value }
    public get title() { return this.current.title }
    public set title(value) { this.current.title = value }
    public get header() { return this.current.header }
    public set header(value) { this.current.header = value }
    public get layer() { return this.current.layer }
    public set layer(value) { this.current.layer = value }

    private get current() {
        if (!this.state) throw new Error("This Client Endpoint is not running")
        return this.state
    }

    public move(position: Position) {
        validate(position.x, "x")
        validate(position.y, "y")
        if (this.position.x === position.x && this.position.y === position.y) return false
        this.position = position
        return true
    }

    public resize(size: Size) {
        validate(size.width, "width")
        validate(size.height, "height")
        if (this.size.width === size.width && this.size.height === size.height) return false
        this.size = size
        return true
    }

    /** Validates and commits a complete geometry without an intermediate state. */
    public setGeometry(geometry: WindowGeometry) {
        validate(geometry.x, "x")
        validate(geometry.y, "y")
        validate(geometry.width, "width")
        validate(geometry.height, "height")
        const moved = this.position.x !== geometry.x || this.position.y !== geometry.y
        const resized = this.size.width !== geometry.width || this.size.height !== geometry.height
        if (!moved && !resized) return { moved, resized }
        this.position = { x: geometry.x, y: geometry.y }
        this.size = { width: geometry.width, height: geometry.height }
        return { moved, resized }
    }

    public setTitle(title: string) {
        const said = readableTitle(title)
        if (this.title === said) return false
        this.title = said
        return true
    }

    public setHeader(header: boolean) {
        const value = boolean(header, "Window header state")
        if (this.header === value) return false
        this.header = value
        return true
    }

    public toJSON() { return { ...this.current } }
}

function readableTitle(value: unknown) {
    const title = String(value ?? "").trim()
    if (!title) throw new Error("A window's title is something a person can read")
    return title
}

function boolean(value: unknown, name: string) {
    if (typeof value !== "boolean") throw new Error(`${name} must be true or false`)
    return value
}

function validate(value: Value, name: string) {
    if (isRelativeValue(value)) return
    throw new Error(`${name} must be a finite pixel number or a relative expression such as "50% + 10"`)
}

export interface WindowSnapshot {
    title: string
    header: boolean
    position: Position
    size: Size
    minimized: boolean
    maximized: boolean
    layer: WindowLayer
    depth: number
}
export type { Position, Size, Value } from "@phreshos/core"
