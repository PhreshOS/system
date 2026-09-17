import { describe, expect, it } from "vitest"
import { physicalToDesktopPixels } from "../source/client/view/structure/desktop/desktop-scale.js"

describe("Desktop scale", () => {
    it("converts physical movement into Desktop pixels", () => {
        expect(physicalToDesktopPixels(125, 1.25)).toBe(100)
        expect(physicalToDesktopPixels(40, 0.5)).toBe(80)
    })
})
