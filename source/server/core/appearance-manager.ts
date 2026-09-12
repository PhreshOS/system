import { extname } from "node:path"
import Keyv from "keyv"
import { z } from "zod"
import {
    appearanceLimits,
    createAppearanceSnapshot,
    defaultAppearance,
    type Appearance,
    type AppearanceRange
} from "@phreshos/core"
import UploadManager from "./upload-manager"

const servedFileSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/)
const wallpaperSchema = servedFileSchema.nullable()
const wallpaperExtensions = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"])

const materialSchema = z.strictObject({
    grain: bounded(appearanceLimits.material.grain),
    grainAmount: bounded(appearanceLimits.material.grainAmount),
    backdrop: bounded(appearanceLimits.material.backdrop),
    opacity: bounded(appearanceLimits.material.opacity),
    distortion: bounded(appearanceLimits.material.distortion),
    saturation: bounded(appearanceLimits.material.saturation)
})

const shadowSchema = z.strictObject({
    x: bounded(appearanceLimits.shadow.x),
    y: bounded(appearanceLimits.shadow.y),
    blur: bounded(appearanceLimits.shadow.blur),
    spread: bounded(appearanceLimits.shadow.spread),
    opacity: bounded(appearanceLimits.shadow.opacity)
})

const easingSchema = z.union([
    z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]),
    z.tuple([
        z.number().min(0).max(1),
        z.number(),
        z.number().min(0).max(1),
        z.number()
    ])
])

const transactionSchema = z.strictObject({
    duration: bounded(appearanceLimits.transaction.duration),
    easing: easingSchema
})

const colorsSchema = z.strictObject({
    background: z.string().min(1),
    foreground: z.string().min(1),
    primary: z.string().min(1),
    secondary: z.string().min(1),
    success: z.string().min(1),
    warning: z.string().min(1),
    danger: z.string().min(1),
    info: z.string().min(1)
})

/** The sole schema for authoritative System Appearance state. */
export const appearanceSchema: z.ZodType<Appearance> = z.strictObject({
    colors: themed(colorsSchema),
    spacing: bounded(appearanceLimits.spacing),
    radius: bounded(appearanceLimits.radius),
    shadow: themed(shadowSchema),
    material: themed(materialSchema),
    transaction: transactionSchema,
    signInWallpaper: themed(wallpaperSchema),
    desktopWallpaper: themed(wallpaperSchema)
})

const storageKey = "appearance"

/** Durable, complete Appearance state owned by Server Core. */
export default class AppearanceManager {
    private constructor(
        private readonly store: Keyv,
        private readonly uploads: UploadManager,
        private current: Appearance
    ) { }

    public static async open(store: Keyv, uploads: UploadManager) {
        const stored = await store.get(storageKey)
        const appearance = createAppearanceSnapshot(appearanceSchema.parse(stored ?? defaultAppearance))

        if (stored === undefined) await store.set(storageKey, appearance)

        return new AppearanceManager(store, uploads, appearance)
    }

    public get value() { return this.current }

    public async update(value: unknown) {
        const appearance = createAppearanceSnapshot(appearanceSchema.parse(value))

        this.validateWallpaper(appearance.signInWallpaper.light)
        this.validateWallpaper(appearance.signInWallpaper.dark)
        this.validateWallpaper(appearance.desktopWallpaper.light)
        this.validateWallpaper(appearance.desktopWallpaper.dark)

        await this.store.set(storageKey, appearance)
        this.current = appearance

        return appearance
    }

    private validateWallpaper(file: string | null) {
        if (file === null) return
        if (!wallpaperExtensions.has(extname(file).slice(1))) throw new Error("A wallpaper must be an image file")
        if (!this.uploads.stat(file)) throw new Error("The wallpaper upload does not exist")
    }
}

function themed<Schema extends z.ZodType>(schema: Schema) {
    return z.strictObject({ light: schema, dark: schema })
}

function bounded(range: AppearanceRange) {
    return z.number().min(range.minimum).max(range.maximum)
}
