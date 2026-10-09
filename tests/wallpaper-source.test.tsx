import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { UIProvider } from "@phreshos/react-ui"
import { defaultAppearance, systemWallpapers } from "@phreshos/core"
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

    function render(file: string, place: WallpaperPlace = "desktop") {
        const wallpapers = { ...systemWallpapers, dark: { ...systemWallpapers.dark, [place]: file } }
        return renderToStaticMarkup(<ApplicationContext.Provider value={application}>
            <UIProvider appearance={defaultAppearance} preferences={{ theme: "dark", animations: true }}>
                <WallpaperBackground place={place} wallpapers={wallpapers} />
            </UIProvider>
        </ApplicationContext.Provider>)
    }

    // The System's own wallpapers are uploads like any other, each shown in its own place.
    assert.match(render(systemWallpapers.dark.signIn, "signIn"), /src="\/uploads\/SIGN_IN_DARK_WALLPAPER"/)
    assert.match(render(systemWallpapers.dark.desktop), /src="\/uploads\/DESKTOP_DARK_WALLPAPER"/)

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
