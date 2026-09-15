import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { AppearanceProvider } from "@phreshos/react-ui"
import { defaultAppearance } from "@phreshos/core"
import { ApplicationContext } from "@client/view/contexts"
import Application from "@client/core/application"
import { WallpaperBackground } from "@client/view/structure/desktop/wallpaper/wallpaper"
import { test } from "vitest"

test("wallpaper source contract", () => {
    const application = new Application("phreshos", "PhreshOS", "1.0.0", {
        link: "/link",
        proxy: "/proxy",
        storage: "/storage",
        uploads: "/uploads",
        program: "/program"
    })

    function render(file: string) {
        return renderToStaticMarkup(<ApplicationContext.Provider value={application}>
            <AppearanceProvider appearance={defaultAppearance} preferences={{ theme: "dark", animations: true }}>
                <WallpaperBackground file={file} />
            </AppearanceProvider>
        </ApplicationContext.Provider>)
    }

    const image = render("00000000-0000-0000-0000-000000000000.png")
    assert.match(image, /<img/)
    assert.match(image, /src="\/uploads\/00000000-0000-0000-0000-000000000000\.png"/)
    assert.match(image, /object-cover/)

    const video = render("00000000-0000-0000-0000-000000000000.webm")
    assert.match(video, /<video/)
    assert.match(video, /autoPlay=""/)
    assert.match(video, /loop=""/)
    assert.match(video, /muted=""/)
    assert.match(video, /playsInline=""/)

    const html = render("00000000-0000-0000-0000-000000000000.html")
    assert.match(html, /<iframe/)
    assert.match(html, /src="\/uploads\/wallpaper\/00000000-0000-0000-0000-000000000000\.html"/)
    assert.match(html, /sandbox="allow-scripts"/)
    assert.match(html, /referrerPolicy="no-referrer"/)
    assert.doesNotMatch(html, /allow-same-origin/)
})
