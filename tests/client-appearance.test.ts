import { defaultAppearance } from "@phreshos/core"
import { describe, expect, it } from "vitest"
import { resolveStoredAppearance } from "../source/client/view/appearance/appearance.js"

describe("Desktop Appearance bootstrap", () => {
    it("restores one complete cached System Appearance", () => {
        const stored = {
            ...defaultAppearance,
            spacing: 15
        }

        expect(resolveStoredAppearance(JSON.stringify(stored))).toEqual(stored)
    })

    it("fills fields absent from an older cached Appearance without losing its values", () => {
        const { overlay: _overlay, ...taskbar } = defaultAppearance.taskbar
        const stored = {
            ...defaultAppearance,
            spacing: 15,
            taskbar: { ...taskbar, position: "top" }
        }

        expect(resolveStoredAppearance(JSON.stringify(stored))).toEqual({
            ...stored,
            taskbar: { ...stored.taskbar, overlay: false }
        })
    })

    it.each([null, "not json", "{}"])("uses the System default when the cached value is %s", value => {
        expect(resolveStoredAppearance(value)).toBe(defaultAppearance)
    })
})
