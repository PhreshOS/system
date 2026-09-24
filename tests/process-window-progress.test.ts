import { processWindowProgress } from "@client/view/structure/desktop/windows/process-window"
import { expect, test } from "vitest"

test("private progress belongs only to the standard Window representation", () => {
    expect(processWindowProgress("window", true, false, false)).toBe("Loading")
    expect(processWindowProgress("window", false, true, false)).toBe("Closing")
    expect(processWindowProgress("window", false, false, true)).toBe("Closing")
    expect(processWindowProgress("window", false, false, false)).toBeNull()

    for (const layer of ["wallpaper", "under", "over", "shell"] as const) {
        expect(processWindowProgress(layer, true, false, false)).toBeNull()
        expect(processWindowProgress(layer, false, true, true)).toBeNull()
    }
})
