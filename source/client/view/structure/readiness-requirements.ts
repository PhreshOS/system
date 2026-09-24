export interface DesktopReadinessRequirement {

    readonly message: string
}

export const connectionRequirement = Object.freeze<DesktopReadinessRequirement>({
    message: "Connecting…"
})

export const sessionRequirement = Object.freeze<DesktopReadinessRequirement>({
    message: "Preparing your session…"
})

export const wallpaperRequirement = Object.freeze<DesktopReadinessRequirement>({
    message: "Loading wallpaper…"
})

export const programsRequirement = Object.freeze<DesktopReadinessRequirement>({
    message: "Loading programs…"
})

export const startupRequirements = Object.freeze([
    connectionRequirement,
    sessionRequirement,
    wallpaperRequirement
])
