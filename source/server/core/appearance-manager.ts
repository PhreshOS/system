import Keyv from "keyv"
import { isDeepStrictEqual } from "node:util"
import { applyAppearanceUpdate, defaultAppearance, isUploadFile, systemWallpapers, wallpaperKind, wallpaperSizeLimit, type Appearance, type AppearanceWallpapers } from "@phreshos/core"
import UploadManager from "./upload-manager"

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
        const held = stored === undefined
            ? defaultAppearance
            : applyAppearanceUpdate(defaultAppearance, stored)

        // A wallpaper that can no longer be shown, such as an upload gone from disk, becomes the
        // System's own for its place, so the Desktop never shows nothing and later changes apply.
        const shown = (theme: "light" | "dark") => Object.fromEntries((Object.keys(systemWallpapers[theme]) as (keyof AppearanceWallpapers)[])
            .map(place => [place, wallpaperProblem(uploads, held.wallpapers[theme][place]) === null ? held.wallpapers[theme][place] : systemWallpapers[theme][place]]))
        const appearance = applyAppearanceUpdate(held, { wallpapers: { light: shown("light"), dark: shown("dark") } })

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

        for (const wallpaper of [appearance.wallpapers.light, appearance.wallpapers.dark]) {
            this.validateWallpaper(wallpaper.signIn)
            this.validateWallpaper(wallpaper.desktop)
        }

        if (isDeepStrictEqual(this.current, appearance)) return this.current

        await this.store.set(storageKey, appearance)
        this.current = appearance

        return appearance
    }

    private validateWallpaper(file: string) {
        const problem = wallpaperProblem(this.uploads, file)

        if (problem) throw new Error(problem)
    }
}

/** Why an upload cannot be a wallpaper, or `null` when it can. */
function wallpaperProblem(uploads: UploadManager, file: string) {
    if (!isUploadFile(file)) return "A wallpaper must be a system upload"

    const upload = uploads.stat(file)

    if (!upload) return "The wallpaper upload does not exist"
    if (!wallpaperKind(file)) return "A wallpaper must be an image, video, or HTML file"
    if (upload.size > wallpaperSizeLimit) return "A wallpaper cannot exceed 50 MiB"

    return null
}
