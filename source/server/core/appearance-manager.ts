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

/** The sole schema for authoritative System Appearance state. */
export const appearanceSchema: z.ZodType<Appearance> = z.strictObject({
    colors: z.strictObject({
        background: themed(z.string().min(1)),
        foreground: themed(z.string().min(1)),
        primary: themed(z.string().min(1)),
        secondary: themed(z.string().min(1)),
        success: themed(z.string().min(1)),
        warning: themed(z.string().min(1)),
        danger: themed(z.string().min(1)),
        info: themed(z.string().min(1))
    }),
    spacing: shared(bounded(appearanceLimits.spacing)),
    radius: shared(bounded(appearanceLimits.radius)),
    shadow: themed(shadowSchema),
    material: themed(materialSchema),
    signInWallpaper: themed(wallpaperSchema),
    desktopWallpaper: themed(wallpaperSchema)
})

const properties = Object.keys(defaultAppearance) as (keyof Appearance)[]

/** Durable, complete Appearance state owned by Server Core. */
export default class AppearanceManager {
    private constructor(
        private readonly store: Keyv,
        private readonly uploads: UploadManager,
        private current: Appearance
    ) { }

    public static async open(store: Keyv, uploads: UploadManager) {
        const entries = await Promise.all(properties.map(async property => ({
            property,
            value: await store.get(`appearance:${property}`)
        })))
        const stored = Object.fromEntries(entries.map(({ property, value }) => [
            property,
            value === undefined ? defaultAppearance[property] : value
        ]))
        const appearance = createAppearanceSnapshot(appearanceSchema.parse(stored))

        await Promise.all(entries
            .filter(({ value }) => value === undefined)
            .map(({ property }) => store.set(`appearance:${property}`, appearance[property])))

        return new AppearanceManager(store, uploads, appearance)
    }

    public get value() { return this.current }

    public async update(value: unknown) {
        const appearance = createAppearanceSnapshot(appearanceSchema.parse(value))

        this.validateWallpaper(appearance.signInWallpaper.light)
        this.validateWallpaper(appearance.signInWallpaper.dark)
        this.validateWallpaper(appearance.desktopWallpaper.light)
        this.validateWallpaper(appearance.desktopWallpaper.dark)

        await Promise.all(properties.map(property => storeProperty(this.store, property, appearance[property])))
        this.current = appearance

        return appearance
    }

    private validateWallpaper(file: string | null) {
        if (file === null) return
        if (!wallpaperExtensions.has(extname(file).slice(1))) throw new Error("A wallpaper must be an image file")
        if (!this.uploads.stat(file)) throw new Error("The wallpaper upload does not exist")
    }
}

function shared<Schema extends z.ZodType>(schema: Schema) {
    return z.strictObject({ light: schema })
}

function themed<Schema extends z.ZodType>(schema: Schema) {
    return z.strictObject({ light: schema, dark: schema })
}

function bounded(range: AppearanceRange) {
    return z.number().min(range.minimum).max(range.maximum)
}

function storeProperty(store: Keyv, property: keyof Appearance, value: Appearance[keyof Appearance]) {
    return store.set(`appearance:${property}`, value)
}
