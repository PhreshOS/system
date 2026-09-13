import Keyv from "keyv"
import { extname } from "node:path"
import { defaultAppearance, parseAppearance, type Appearance } from "@phreshos/core"
import UploadManager from "./upload-manager"

const storageKey = "appearance"
const servedFile = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/
const wallpaperExtensions = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"])

/** Durable, complete Appearance state owned by Server Core. */
export default class AppearanceManager {
    private constructor(
        private readonly store: Keyv,
        private readonly uploads: UploadManager,
        private current: Appearance
    ) { }

    public static async open(store: Keyv, uploads: UploadManager) {
        const stored = await store.get(storageKey)
        const appearance = parseAppearance(stored ?? defaultAppearance)

        if (stored === undefined) await store.set(storageKey, appearance)

        return new AppearanceManager(store, uploads, appearance)
    }

    public get value() { return this.current }

    public async update(value: unknown) {
        const appearance = parseAppearance(value)

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
        if (!servedFile.test(file)) throw new Error("A wallpaper must be a system upload")
        if (!wallpaperExtensions.has(extname(file).slice(1))) throw new Error("A wallpaper must be an image file")
        if (!this.uploads.stat(file)) throw new Error("The wallpaper upload does not exist")
    }
}
