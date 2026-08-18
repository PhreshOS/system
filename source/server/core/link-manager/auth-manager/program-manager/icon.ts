import { stat } from "node:fs/promises"
import { type ProgramIconSize } from "@phreshos/core"
import type Program from "./program"
import sharp from "sharp"

export const iconSizes = {

    small: 32,

    medium: 64,

    large: 128

} as const

export type IconSize = ProgramIconSize

export function isIconSize(value: unknown): value is IconSize {

    return typeof value === "string" && value in iconSizes
}

export const iconSource = {

    minimum: 128,

    maximum: 2_048,

    maximumBytes: 5 * 1_024 * 1_024

} as const

/** Verify the one source image before a Program is accepted. */
export async function validateIcon(path: string) {

    const information = await stat(path).catch(() => null)

    if (!information?.isFile()) throw new Error(`The icon file is not there: ${path}`)

    if (information.size > iconSource.maximumBytes) throw new Error(`A Program icon cannot exceed ${iconSource.maximumBytes / 1_024 / 1_024} MiB`)

    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>

    try {

        metadata = await sharp(path, { failOn: "error", limitInputPixels: iconSource.maximum ** 2 }).metadata()
    }

    catch { throw new Error(`The Program icon is not a valid PNG: ${path}`) }

    if (metadata.format !== "png") throw new Error(`The Program icon must be a PNG: ${path}`)

    const width = metadata.width ?? 0

    const height = metadata.height ?? 0

    if (width < iconSource.minimum || height < iconSource.minimum) throw new Error(`A Program icon must be at least ${iconSource.minimum} pixels in both dimensions`)

    if (width > iconSource.maximum || height > iconSource.maximum) throw new Error(`A Program icon cannot exceed ${iconSource.maximum} pixels in either dimension`)
}

/** Lazily render each standard representation no more than once. */
export class IconRenderer {

    private validation: Promise<void> | null = null

    private readonly rendered = new Map<IconSize, Promise<Buffer>>()

    public constructor(private readonly path: string) {}

    public render(size: IconSize) {

        const existing = this.rendered.get(size)

        if (existing) return existing

        const rendering = this.create(size)

        this.rendered.set(size, rendering)

        return rendering
    }

    private async create(size: IconSize) {

        this.validation ??= validateIcon(this.path)

        await this.validation

        const length = iconSizes[size]

        return await sharp(this.path, { failOn: "error", limitInputPixels: iconSource.maximum ** 2 })

            .resize(length, length, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })

            .png()

            .toBuffer()
    }
}

interface CachedRenderer {

    revision: number

    renderer: IconRenderer
}

/**
 * The authoritative, bounded icon renderer shared by every delivery road.
 * Runtime Programs own at most three buffers; every omitted icon shares the
 * same default renderer, and forgotten Programs leave this WeakMap naturally.
 */
export class ProgramIcons {

    private readonly fallback: IconRenderer

    private readonly programs = new WeakMap<Program, CachedRenderer>()

    public constructor(defaultIcon: string) {

        this.fallback = new IconRenderer(defaultIcon)
    }

    public async render(program: Program, size: IconSize) {

        const path = program.iconPath

        if (!path) return await this.fallback.render(size)

        const cached = this.programs.get(program)

        const renderer = cached?.revision === program.revision ? cached.renderer : new IconRenderer(path)

        if (renderer !== cached?.renderer) this.programs.set(program, { revision: program.revision, renderer })

        // A source can disappear after Program validation. The icon contract
        // remains total, so this external filesystem race uses the default.
        return await renderer.render(size).catch(() => this.fallback.render(size))
    }
}
