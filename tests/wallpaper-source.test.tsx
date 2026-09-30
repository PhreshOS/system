import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { UIProvider } from "@phreshos/react-ui"
import { defaultAppearance } from "@phreshos/core"
import { ApplicationContext } from "@client/view/contexts"
import Application from "@client/core/application"
import { WallpaperBackground, type WallpaperPlace } from "@client/view/structure/desktop/layers/wallpaper/wallpaper"
import { test } from "vitest"

test("wallpaper source contract", () => {
    const application = new Application({
        link: "/link",
        proxy: "/proxy",
        storage: "/storage",
        uploads: "/uploads",
        program: "/program"
    })

    function render(file: string | null, place: WallpaperPlace = "desktop") {
        return renderToStaticMarkup(<ApplicationContext.Provider value={application}>
            <UIProvider appearance={defaultAppearance} preferences={{ theme: "dark", animations: true }}>
                <WallpaperBackground place={place} file={file} />
            </UIProvider>
        </ApplicationContext.Provider>)
    }

    // Without a chosen wallpaper, the sign-in screen shows the seed and the Desktop the release's own.
    assert.match(render(null, "signIn"), /seed-dark/)
    assert.match(render(null, "desktop"), /sprout-dark/)

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
