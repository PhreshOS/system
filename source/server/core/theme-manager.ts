import Keyv from "keyv"
import { z } from "zod"
import { createThemeSnapshot, standardTheme, themeLimits, type ThemeProperties, type ThemeRange } from "@phreshos/core"

const storageKey = "appearance:theme"

/** The authoritative schema for the system Theme. */
export const themeSchema: z.ZodType<ThemeProperties> = z.strictObject({
    background: z.string().min(1).default(standardTheme.background),
    foreground: z.string().min(1).default(standardTheme.foreground),
    accent: z.string().min(1).default(standardTheme.accent),
    spacing: bounded(themeLimits.spacing).default(standardTheme.spacing),
    radius: bounded(themeLimits.radius).default(standardTheme.radius),
    glass: z.strictObject({
        distortion: bounded(themeLimits.glass.distortion).default(standardTheme.glass.distortion),
        blur: bounded(themeLimits.glass.blur).default(standardTheme.glass.blur),
        saturation: bounded(themeLimits.glass.saturation).default(standardTheme.glass.saturation),
        brightness: bounded(themeLimits.glass.brightness).default(standardTheme.glass.brightness),
        opacity: bounded(themeLimits.glass.opacity).default(standardTheme.glass.opacity)
    }).default(standardTheme.glass),
    surface: z.strictObject({
        color: z.string().min(1).default(standardTheme.surface.color),
        grain: bounded(themeLimits.surface.grain).default(standardTheme.surface.grain),
        animation: bounded(themeLimits.surface.animation).default(standardTheme.surface.animation),
        backdrop: bounded(themeLimits.surface.backdrop).default(standardTheme.surface.backdrop),
        opacity: bounded(themeLimits.surface.opacity).default(standardTheme.surface.opacity)
    }).default(standardTheme.surface)
})

/** Durable, authoritative Theme state owned by the server core. */
export default class ThemeManager {

    private current: ThemeProperties

    private constructor(private readonly store: Keyv, theme: ThemeProperties) {

        this.current = theme
    }

    /** Opens and validates the persisted Theme, or starts from the default. */
    public static async open(store: Keyv) {

        const stored = await store.get(storageKey)

        const theme = createThemeSnapshot(themeSchema.parse(stored ?? standardTheme))

        if (stored === undefined) await store.set(storageKey, theme)

        return new ThemeManager(store, theme)
    }

    /** The complete immutable Theme snapshot. */
    public get value() {

        return this.current
    }

    /** Validates and durably replaces the authoritative Theme. */
    public async update(value: unknown) {

        const theme = createThemeSnapshot(themeSchema.parse(value))

        await this.store.set(storageKey, theme)

        this.current = theme

        return theme
    }
}

function bounded(range: ThemeRange) {

    return z.number().min(range.minimum).max(range.maximum)
}
