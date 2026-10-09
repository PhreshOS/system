import { resolve } from "node:path"
import { systemWallpapers } from "@phreshos/core"

/** The files behind the upload keys the System keeps, read from the sources as a build carries them. */
export const systemFiles = Object.fromEntries(Object.values(systemWallpapers)
    .flatMap(wallpapers => Object.values(wallpapers))
    .map(key => [key, resolve(`assets/wallpapers/${key}.webp`)]))
