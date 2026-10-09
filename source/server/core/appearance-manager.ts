import Keyv from "keyv"
import { isDeepStrictEqual } from "node:util"
import { applyAppearanceUpdate, defaultAppearance, isUploadFile, type Appearance } from "@phreshos/core"
import UploadManager from "./upload-manager"
import { wallpaperKind, wallpaperSizeLimit } from "@shared/wallpaper"

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
        const appearance = stored === undefined
            ? defaultAppearance
            : applyAppearanceUpdate(defaultAppearance, stored)

        // Persisted Appearance values may predate newly introduced fields. They
        // remain overrides of the current defaults, then become canonical here.
        if (stored === undefined || !isDeepStrictEqual(stored, appearance)) {
            await store.set(storageKey, appearance)
        }

        return new AppearanceManager(store, uploads, appearance)
    }

    public get value() { return this.current }

    public async update(value: unknown) {
        const appearance = applyAppearanceUpdate(this.current, value)

        for (const wallpaper of [appearance.wallpaper.light, appearance.wallpaper.dark]) {
            this.validateWallpaper(wallpaper.signIn)
            this.validateWallpaper(wallpaper.desktop)
        }

        if (isDeepStrictEqual(this.current, appearance)) return this.current

        await this.store.set(storageKey, appearance)
        this.current = appearance

        return appearance
    }

    private validateWallpaper(file: string) {
        if (!isUploadFile(file)) throw new Error("A wallpaper must be a system upload")

        const upload = this.uploads.stat(file)

        if (!upload) throw new Error("The wallpaper upload does not exist")
        if (!wallpaperKind(file)) throw new Error("A wallpaper must be an image, video, or HTML file")
        if (upload.size > wallpaperSizeLimit) throw new Error("A wallpaper cannot exceed 50 MiB")
    }
}
