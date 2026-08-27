import bundledWallpaper from "@/assets/bundled/wallpaper.jpg"
import { ApplicationContext } from "@client/view2/contexts"
import Source, { type WallpaperSource } from "./source"
import { useMemo, useState } from "react"

const bundled: WallpaperSource = {

    identity: "bundled",

    source: bundledWallpaper,

    type: "image"
}

export default function ({ file, visible }: Properties) {

    const application = ApplicationContext.useValue()

    const requested = useMemo<WallpaperSource | null>(() => file === undefined ? null : file === null ? bundled : {

        identity: `file:${file}`,

        source: `${application.doors.uploads}/${encodeURIComponent(file)}`,

        type: /\.html?$/i.test(file) ? "document" : "image"

    }, [application.doors.uploads, file])

    const [displayed, setDisplayed] = useState<WallpaperSource>(bundled)

    const sources = !requested || requested.identity === displayed.identity ? [displayed] : [displayed, requested]

    return <>{sources.map(source => <Source

        key={source.identity}

        value={source}

        visible={visible && source.identity === displayed.identity}

        loaded={() => {

            if (source.identity === requested?.identity) setDisplayed(source)
        }}

    />)}</>
}

interface Properties {

    file: string | null | undefined

    visible: boolean
}
