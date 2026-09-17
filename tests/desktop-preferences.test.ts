import { defaultDesktopScale, desktopPreferencesLimits } from "@phreshos/core"
import { describe, expect, it } from "vitest"
import { resolveStoredDesktopScale, serializeDesktopScalePreference } from "../source/client/view/appearance/desktop-preferences.js"

describe("Desktop preference persistence", () => {
    it("resolves a stored scale within the contract bounds", () => {
        expect(resolveStoredDesktopScale("1.25")).toBe(1.25)
        expect(resolveStoredDesktopScale(String(desktopPreferencesLimits.scale.minimum))).toBe(desktopPreferencesLimits.scale.minimum)
        expect(resolveStoredDesktopScale(String(desktopPreferencesLimits.scale.maximum))).toBe(desktopPreferencesLimits.scale.maximum)
    })

    it.each([null, "", "0.49", "2.01", "not-a-number"])("uses the default for stored value %s", value => {
        expect(resolveStoredDesktopScale(value)).toBe(defaultDesktopScale)
    })

    it("stores direct values and removes the override for default", () => {
        expect(serializeDesktopScalePreference(1.25)).toBe("1.25")
        expect(serializeDesktopScalePreference("default")).toBeNull()
    })
})
