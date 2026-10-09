import { expect, test } from "vitest"
import deviceDescription from "@libs/device-description"

test("a User-Agent becomes a short browser and system description", () => {
    expect(deviceDescription("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36")).toBe("Chrome on macOS")
    expect(deviceDescription("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0")).toBe("Edge on Windows")
    expect(deviceDescription("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0")).toBe("Firefox on Linux")
    expect(deviceDescription("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS")
    expect(deviceDescription("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36")).toBe("Chrome on Android")
    expect(deviceDescription("curl/8.7.1")).toBeNull()
    expect(deviceDescription(null)).toBeNull()
})
