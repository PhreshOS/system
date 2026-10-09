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

/** The System's picture on the sign-in and sign-up form: the page appears with it, never without. */
export const logoRequirement = Object.freeze<DesktopReadinessRequirement>({
    message: "Loading…"
})

export const programsRequirement = Object.freeze<DesktopReadinessRequirement>({
    message: "Loading programs…"
})

export const startupRequirements = Object.freeze([
    connectionRequirement,
    sessionRequirement,
    wallpaperRequirement
])
