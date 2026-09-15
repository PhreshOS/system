/** Wallpaper sources accepted by the System-owned Appearance boundary. */
export type WallpaperKind = "image" | "video" | "html"

/** Applying a wallpaper is deliberately stricter than storing an upload. */
export const wallpaperSizeLimit = 50 * 1024 * 1024

const wallpaperKinds: Readonly<Record<string, WallpaperKind>> = {
    avif: "image",
    bmp: "image",
    gif: "image",
    jpeg: "image",
    jpg: "image",
    png: "image",
    svg: "image",
    webp: "image",
    mp4: "video",
    ogg: "video",
    ogv: "video",
    webm: "video",
    html: "html"
}

export function wallpaperKind(file: string): WallpaperKind | null {
    const extension = file.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()

    return extension ? wallpaperKinds[extension] ?? null : null
}
