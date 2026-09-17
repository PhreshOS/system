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

    it.each([null, "not json", "{}"])("uses the System default when the cached value is %s", value => {
        expect(resolveStoredAppearance(value)).toBe(defaultAppearance)
    })
})
