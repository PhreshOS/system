import { resolve } from "node:path"
import { systemWallpapers } from "@phreshos/core"

/** The files behind the upload keys the System keeps, read from the sources as a build carries them. */
export const systemFiles = {
    [systemWallpapers.light.signIn]: resolve("assets/wallpapers/sign-in-light.webp"),
    [systemWallpapers.dark.signIn]: resolve("assets/wallpapers/sign-in-dark.webp"),
    [systemWallpapers.light.desktop]: resolve("assets/wallpapers/desktop-light.webp"),
    [systemWallpapers.dark.desktop]: resolve("assets/wallpapers/desktop-dark.webp")
}
