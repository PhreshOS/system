import Keyv from "keyv"
import { defaultAppearance, parseAppearance, type Appearance } from "@phreshos/core"
import UploadManager from "./upload-manager"
import { wallpaperKind, wallpaperSizeLimit } from "@shared/wallpaper"

const storageKey = "appearance"
const servedFile = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/

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

        const upload = this.uploads.stat(file)

        if (!upload) throw new Error("The wallpaper upload does not exist")
        if (!wallpaperKind(file)) throw new Error("A wallpaper must be an image, video, or HTML file")
        if (upload.size > wallpaperSizeLimit) throw new Error("A wallpaper cannot exceed 50 MiB")
    }
}
